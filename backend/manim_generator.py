"""
Manim Video Generator for SnapLearn AI
Generates educational videos using Manim locally as subprocess
"""

import os
import logging
import subprocess
import json
import tempfile
import asyncio
import sys
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path

from models import VideoResponse, StudentProfile
from utils import schedule_async_init
from video_narration import (
    generate_narration_text,
    synthesize_speech_to_file,
    mux_video_audio,
    ffmpeg_invoked,
)

logger = logging.getLogger(__name__)

class ManimGenerator:
    """Generates educational videos using Manim"""
    
    def __init__(self):
        self.videos_dir = Path("../videos")
        self.temp_dir = Path("../temp_manim")
        self.prompts_dir = Path("../prompts")
        
        # Create directories
        self.videos_dir.mkdir(exist_ok=True)
        self.temp_dir.mkdir(exist_ok=True)
        
        # Initialize Gemini client for script generation
        self.gemini_client = None
        self.model_name = "gemini-2.5-flash"
        
        # Create manim scene prompt template
        self._create_manim_prompt_template()
        
        # Initialize Gemini
        schedule_async_init(self._init_gemini())
    
    async def _init_gemini(self):
        """Initialize Gemini client for script generation"""
        try:
            from google import genai
            
            api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            if not api_key:
                logger.error("Gemini API key not found for video script generation")
                return
            
            self.gemini_client = genai.Client(api_key=api_key, http_options={'headers': {'Referer': 'http://localhost'}})
            logger.info("Manim generator: Gemini client initialized")
            
        except ImportError:
            logger.error("Google GenAI library not installed for video generation")
        except Exception as e:
            logger.error(f"Error initializing Gemini for video generation: {str(e)}")
    
    def _create_manim_prompt_template(self):
        """Create the Manim scene generation prompt template"""
        prompt_template = """You are an expert at creating Manim scene scripts for educational videos.

STUDENT CONTEXT:
- Grade Level: {grade_level}
- Topic: {topic}
- Language: {language}
- Target on-screen video length: about {target_duration_minutes} minutes (this is a goal; use run_time and self.wait to pace)
- Number of main segments to teach: {section_count} (each segment should be clearly separated with a short pause)
- Student Learning Profile: {student_profile_summary}
- FULL Spoken Script (Narration): {narration_excerpt}
- Optional extra context from the user/teacher: {extra_context}

REQUIREMENTS:
1. Create a complete Manim scene script for grade {grade_level}
2. Use only Manim Community Edition v0.18+ APIs
3. The script must be syntactically correct Python
4. IMPORTANT: The video MUST be paced to match the narration! Use long self.wait() calls (e.g., self.wait(10), self.wait(20), self.wait(30)) while the teacher is speaking to ensure the video doesn't end prematurely.
5. Use simple vocabulary for lower grades, more advanced for higher grades
6. Include worked examples where relevant

MANIM SCRIPT REQUIREMENTS:
- Break this explanation into 4-6 visual scenes using python comments. For each scene comment, provide: 1. The specific text/equations to show. 2. The animation type (e.g., Write, Transform). 3. The estimated reading time in seconds.
- Extend the Scene class (class name must be ExplanationScene)
- Include a title card opening
- Divide the lesson into {section_count} clear segments (intro, concepts, example(s), summary)
- Use Text for all text and math. CRITICAL: Do NOT use MathTex or Tex under any circumstances! The environment does not support LaTeX.
- Use Write() for text animations and Create() for shapes; FadeOut to transition
- Set self.wait() generously to keep the screen active while the long narration plays. The narration is {target_duration_minutes} minutes long, so you MUST pad the script with self.wait() to match.
- CRITICAL: Use only standard Manim colors (WHITE, BLACK, RED, BLUE, GREEN, YELLOW, PURPLE, ORANGE, PINK, TEAL, MAROON). Do NOT use colors like BROWN or custom hex codes.
- CRITICAL: Do NOT call `.rotate()`, `.scale()`, or `.normalize()` on direction vectors (like `UR`, `UP`) or any NumPy arrays (like those returned by `get_start()`, `get_end()`, or `get_vector()`). NumPy arrays do NOT have these methods. Use `manim.utils.space_ops.normalize(vector)` or `(vector / np.linalg.norm(vector))` instead.
- CRITICAL: Keep geometry simple to avoid API crashes (e.g., avoid `RightAngle` unless you pass two valid `Line` objects). Rely primarily on `Text`.
- CRITICAL: If you use the `random` library (e.g. for `random.uniform`), you MUST include `import random` at the very top of the script. Otherwise, do not use it.
- CRITICAL: Never use `.to_center()` or `.to_origin()`. These methods do not exist. Mobjects are centered by default; if you need to center one explicitly, use `.move_to(ORIGIN)`.
- CRITICAL: Never use the `alignment_point` argument in `.move_to()`. If you need to align by an edge, use `aligned_edge=UP/DOWN/LEFT/RIGHT`.

RESPONSE FORMAT:
Return ONLY the Python code for the Manim scene, no explanations or markdown.

Example structure:
```python
from manim import *

class ExplanationScene(Scene):
    def construct(self):
        # Scene 1: Title Card
        # Text/Equations: "{topic}"
        # Animation: Write
        # Estimated reading time: 10 seconds
        title = Text("{topic}", font_size=48, color=BLUE)
        self.play(Write(title))
        self.wait(10)
        self.play(FadeOut(title))
        
        # Scene 2: Concept Breakdown
        # Text/Equations: Visualizing the core idea
        # Animation: Multiple Write and Create calls to build the idea
        # Estimated reading time: 45 seconds
        concept_title = Text("How it Works", font_size=40, color=YELLOW).to_edge(UP)
        self.play(Write(concept_title))
        
        step1 = Text("1. First part of the process", font_size=32).shift(UP*1)
        self.play(Write(step1))
        self.wait(10) # Pacing for first part of narration
        
        step2 = Text("2. Second part with a formula: E = mc^2", font_size=32)
        step2.next_to(step1, DOWN)
        self.play(Write(step2))
        self.wait(15) # Pacing for second part
        
        step3 = Text("3. Final conclusion", font_size=32).shift(DOWN*1)
        self.play(Write(step3))
        self.wait(20) # Pacing for final part
        
        self.play(FadeOut(concept_title, step1, step2, step3))
        
        # [GENERATE MORE SCENES FOR EXAMPLES AND DETAILED VISUALS HERE]
        # [CRITICAL: MATCH THE PACE OF THE NARRATION WITH VISUALS, NOT JUST STATIC WAITS]
```

Generate the Manim script for topic: {topic} with approximate length target {target_duration_minutes} minutes."""
        
        # Save the prompt template
        prompt_file = self.prompts_dir / "manim_scene.txt"
        prompt_file.parent.mkdir(exist_ok=True)
        with open(prompt_file, 'w', encoding='utf-8') as f:
            f.write(prompt_template)
        
        self.manim_prompt_template = prompt_template
    
    @staticmethod
    def _section_count_for_duration(target_minutes: float) -> int:
        t = max(0.5, min(15.0, float(target_minutes or 5.0)))
        return max(4, min(20, int(3 + t * 1.15)))

    async def generate_video(
        self,
        topic: str,
        grade_level: str,
        student_profile: StudentProfile,
        language: str = "en",
        target_duration_minutes: float = 5.0,
        enable_tts: bool = True,
        extra_context: Optional[str] = None,
    ) -> VideoResponse:
        """Generate educational video for given topic, optional TTS, configurable length target."""
        try:
            tmin = max(0.5, min(15.0, float(target_duration_minutes or 5.0)))
            logger.info("Starting video generation for topic: %s (target ~%s min, tts=%s)", topic, tmin, enable_tts)

            narration_text = ""
            if self.gemini_client:
                narration_text = await generate_narration_text(
                    self.gemini_client,
                    self.model_name,
                    topic,
                    str(grade_level),
                    language,
                    tmin,
                    extra_context=extra_context,
                )
            if (narration_text or "").strip():
                excerpt = narration_text
            else:
                excerpt = f"Narration disabled or unavailable. Teach {topic} for grade {grade_level} with depth suitable for a ~{tmin} minute lesson."
            manim_script = await self._generate_manim_script(
                topic,
                grade_level,
                student_profile,
                language,
                target_duration_minutes=tmin,
                extra_context=extra_context,
                narration_excerpt=excerpt,
            )

            if not manim_script:
                raise Exception("Failed to generate Manim script")

            if not self._validate_manim_script(manim_script):
                manim_script = await self._fix_manim_script(manim_script, topic)

            video_info = await self._render_manim_video(manim_script, topic, target_duration_minutes=tmin)
            lp = video_info.pop("local_video_path", None)
            vpath = Path(lp) if isinstance(lp, str) else (lp if isinstance(lp, Path) else None)

            has_audio = False
            tts_engine = None
            if (
                enable_tts
                and narration_text
                and vpath
                and vpath.is_file()
                and ffmpeg_invoked()
            ):
                audio_path = vpath.parent / f"{vpath.stem}_narration.mp3"
                out_path = vpath.parent / f"{vpath.stem}_with_audio.mp4"
                t_ok, tts_engine, vtt_path = await synthesize_speech_to_file(narration_text, language, audio_path)
                if t_ok and mux_video_audio(vpath, audio_path, out_path, vtt_path):
                    has_audio = True
                    try:
                        if vpath.is_file():
                            vpath.unlink()
                    except OSError:
                        pass
                    try:
                        if audio_path.is_file():
                            audio_path.unlink()
                    except OSError:
                        pass
                    video_name = out_path.name
                    video_info["video_url"] = f"/videos/{video_name}"
                    if vtt_path and vtt_path.is_file():
                        video_info["vtt_url"] = f"/videos/{vtt_path.name}"
                    if video_info.get("duration_seconds") is None or video_info.get("duration_seconds", 0) < 0.1:
                        video_info["duration_seconds"] = await self._get_video_duration(out_path)
                    if video_info.get("file_size_mb") is not None and out_path.is_file():
                        video_info["file_size_mb"] = round(out_path.stat().st_size / (1024 * 1024), 2)
            elif enable_tts and not ffmpeg_invoked():
                logger.warning("TTS enabled but ffmpeg missing; video stays silent")
            elif enable_tts and not narration_text:
                logger.warning("TTS enabled but no narration text produced")

            video_info["has_audio"] = has_audio
            video_info["tts_engine"] = tts_engine
            video_info["narration_preview"] = (narration_text[:500] + "…") if len(narration_text) > 500 else (narration_text or None)

            return VideoResponse(**video_info)
        except Exception as e:
            logger.error(f"Error generating video: {str(e)}")
            return self._create_fallback_video_response(topic, str(e))
    
    async def _generate_manim_script(
        self,
        topic: str,
        grade_level: str,
        student_profile: StudentProfile,
        language: str,
        target_duration_minutes: float = 5.0,
        extra_context: Optional[str] = None,
        narration_excerpt: str = "none",
    ) -> str:
        """Generate Manim script using Gemini API"""
        try:
            if not self.gemini_client:
                return self._create_fallback_script(topic, grade_level)
            
            # Prepare student profile summary
            profile_summary = {
                "learning_style": student_profile.learning_style.value,
                "confusion_areas": list(student_profile.confusion_patterns.keys())[:3],
                "success_areas": list(student_profile.success_patterns.keys())[:3]
            }
            tmin = max(0.5, min(15.0, float(target_duration_minutes or 5.0)))
            sc = self._section_count_for_duration(tmin)
            ex = (extra_context or "").strip() or "none"
            
            # Format the prompt
            ne = (narration_excerpt or "none").replace("{", "{{").replace("}", "}}")
            prompt = self.manim_prompt_template.format(
                topic=topic,
                grade_level=grade_level,
                language=language,
                target_duration_minutes=round(tmin, 1),
                section_count=sc,
                narration_excerpt=ne,
                extra_context=ex.replace("{", "{{").replace("}", "}}")[:4000],
                student_profile_summary=json.dumps(profile_summary)
            )
            
            # Call Gemini API
            response = self.gemini_client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            
            # Extract Python code from response
            script = self._extract_python_code(response.text)
            
            logger.info("Manim script generated successfully")
            return script
            
        except Exception as e:
            logger.error(f"Error generating Manim script: {str(e)}")
            return self._create_fallback_script(topic, grade_level)
    
    def _extract_python_code(self, response_text: str) -> str:
        """Extract Python code from Gemini response"""
        try:
            # Remove markdown code blocks
            import re
            
            script = ""
            # Look for python code blocks
            python_match = re.search(r'```python\s*(.*?)\s*```', response_text, re.DOTALL)
            if python_match:
                script = python_match.group(1)
            else:
                # Look for any code blocks
                code_match = re.search(r'```\s*(.*?)\s*```', response_text, re.DOTALL)
                if code_match:
                    script = code_match.group(1)
                else:
                    # If no code blocks, assume entire response is code
                    script = response_text.strip()
            
            # Final cleanup: ensure common imports if used but missing
            if "random." in script and "import random" not in script:
                script = "import random\n" + script
            if ("np." in script or "numpy." in script) and "import numpy" not in script:
                script = "import numpy as np\n" + script
                
            # Fix common hallucinations
            script = script.replace(".to_center()", ".move_to(ORIGIN)")
            script = script.replace(".to_origin()", ".move_to(ORIGIN)")
            
            # Fix version confusion: alignment_point is not a valid argument for move_to in Manim Community
            import re
            script = re.sub(r'alignment_point\s*=\s*[^,)]+', '', script)
            # Clean up potential double commas or commas before closing parenthesis
            script = script.replace(", ,", ",")
            script = script.replace(",)", ")")
            script = script.replace("(,", "(")
            
            # Automatically fix `.normalize()` on objects that might be numpy arrays
            script = re.sub(r'([a-zA-Z0-9_]+)\.normalize\(\)', r'(\1 / np.linalg.norm(\1))', script)
            script = re.sub(r'(\([^,)]+\))\.normalize\(\)', r'(\1 / np.linalg.norm(\1))', script)
            script = re.sub(r'([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\([^,)]*\))\.normalize\(\)', r'(\1 / np.linalg.norm(\1))', script)

            # Automatically fix `.rotate()` on objects that might be numpy arrays
            # manim.utils.space_ops.rotate_vector is usually available as rotate_vector with 'from manim import *'
            # We ONLY apply this to parenthesized expressions (likely vector math) 
            # because .rotate() IS a valid method for Mobjects.
            script = re.sub(r'(\([^,)]+[\+\-\*\/][^,)]+\))\.(rotate)\(([^)]*(?:\([^)]*\)[^)]*)*)\)', r'rotate_vector(\1, \3)', script)

            # Automatically fix `.scale()` on objects that might be numpy arrays
            # We ONLY apply this to parenthesized expressions (likely vector math)
            # because .scale() IS a valid method for Mobjects.
            script = re.sub(r'(\([^,)]+[\+\-\*\/][^,)]+\))\.(scale)\(([^)]*(?:\([^)]*\)[^)]*)*)\)', r'(\1 * \3)', script)

            # Automatically fix `.cross()` on objects that might be numpy arrays
            # numpy.cross(a, b) is the standard way
            script = re.sub(r'([a-zA-Z0-9_]+)\.cross\(([^)]+)\)', r'np.cross(\1, \2)', script)
            script = re.sub(r'(\([^,)]+\))\.(cross)\(([^)]+)\)', r'np.cross(\1, \3)', script)

            # Final check for numpy if we injected it
            if "np." in script and "import numpy" not in script:
                script = "import numpy as np\n" + script
                
            return script
            
        except Exception as e:
            logger.error(f"Error extracting Python code: {str(e)}")
            return response_text
    
    def _validate_manim_script(self, script: str) -> bool:
        """Validate Manim script for basic syntax"""
        try:
            # Check for basic Manim requirements
            required_elements = [
                "from manim import",
                "class ",
                "Scene",
                "def construct(self):"
            ]
            
            for element in required_elements:
                if element not in script:
                    logger.warning(f"Missing required element: {element}")
                    return False
            
            # Try to compile the script
            compile(script, '<string>', 'exec')
            
            return True
            
        except SyntaxError as e:
            logger.error(f"Syntax error in Manim script: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Error validating script: {str(e)}")
            return False
    
    async def _fix_manim_script(self, broken_script: str, topic: str) -> str:
        """Attempt to fix broken Manim script using Gemini"""
        try:
            if not self.gemini_client:
                return self._create_fallback_script(topic, "4")
            
            fix_prompt = f"""The following Manim script has syntax errors. Please fix it and return only the corrected Python code:

```python
{broken_script}
```

Requirements:
1. Fix all syntax errors
2. Ensure all imports are correct
3. Make sure the class extends Scene
4. Verify the construct method is properly defined
5. Return ONLY the corrected Python code

Fixed script:"""
            
            response = self.gemini_client.models.generate_content(
                model=self.model_name,
                contents=fix_prompt
            )
            
            fixed_script = self._extract_python_code(response.text)
            
            # Validate the fixed script
            if self._validate_manim_script(fixed_script):
                logger.info("Successfully fixed Manim script")
                return fixed_script
            else:
                logger.warning("Fixed script still has issues, using fallback")
                return self._create_fallback_script(topic, "4")
                
        except Exception as e:
            logger.error(f"Error fixing Manim script: {str(e)}")
            return self._create_fallback_script(topic, "4")
    
    def _create_fallback_script(self, topic: str, grade_level: str) -> str:
        """Create a simple fallback Manim script"""
        return f'''from manim import *

class ExplanationScene(Scene):
    def construct(self):
        # Title
        title = Text("{topic}", font_size=48, color=BLUE)
        subtitle = Text("Educational Video", font_size=24, color=WHITE)
        subtitle.next_to(title, DOWN)
        
        self.play(Write(title))
        self.play(Write(subtitle))
        self.wait(2)
        
        # Clear screen
        self.play(FadeOut(title), FadeOut(subtitle))
        
        # Main content
        content = Text("Let's learn about {topic}!", font_size=36, color=GREEN)
        self.play(Write(content))
        self.wait(2)
        
        # Example or explanation
        explanation = Text("This is an important concept\\nfor grade {grade_level} students.", font_size=28, color=YELLOW)
        explanation.next_to(content, DOWN, buff=1)
        self.play(Write(explanation))
        self.wait(3)
        
        # Summary
        self.play(FadeOut(content), FadeOut(explanation))
        summary = Text("Great job learning about {topic}!", font_size=32, color=BLUE)
        self.play(Write(summary))
        self.wait(2)
        
        # End
        self.play(FadeOut(summary))'''
    
    async def _render_manim_video(
        self,
        script: str,
        topic: str,
        target_duration_minutes: float = 5.0,
    ) -> Dict[str, Any]:
        """Render video using Manim subprocess"""
        try:
            tmin = max(0.5, min(15.0, float(target_duration_minutes or 5.0)))
            # Scale render cap with requested length (up to 20 min wall clock for very long scene graphs)
            render_timeout = int(min(1200, max(300, 180 + tmin * 90)))
            # Create unique filenames
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            script_filename = f"scene_{timestamp}.py"
            video_id = f"video_{timestamp}"
            
            # Write script to temporary file
            script_path = self.temp_dir / script_filename
            with open(script_path, 'w', encoding='utf-8') as f:
                f.write(script)
            
            # Prepare Manim command
            output_dir = self.videos_dir
            manim_cmd = [
                sys.executable, "-m", "manim",
                str(script_path),
                "ExplanationScene",  # Default scene class name
                "-o", f"{video_id}.mp4",
                "--media_dir", str(output_dir),
                "-v", "WARNING",  # Reduce verbosity
                "--disable_caching",
                "-ql"             # Low Quality flag for faster rendering
            ]
            
            # Record start time
            start_time = datetime.now()
            
            # Run Manim subprocess
            logger.info(f"Running Manim command: {' '.join(manim_cmd)} (timeout {render_timeout}s)")
            
            # Wait for completion with timeout
            try:
                result = await asyncio.to_thread(
                    subprocess.run,
                    manim_cmd,
                    cwd=self.temp_dir,
                    capture_output=True,
                    text=True,
                    timeout=render_timeout
                )
                stdout = result.stdout
                stderr = result.stderr
                returncode = result.returncode
            except subprocess.TimeoutExpired:
                raise Exception("Manim rendering timed out; try a shorter target duration or simplify the topic")
            
            # Calculate generation time
            generation_time = (datetime.now() - start_time).total_seconds()
            
            # Check if rendering was successful
            if returncode != 0:
                error_msg = stderr or stdout or "Unknown Manim error"
                logger.error(f"Manim rendering failed: {error_msg}")
                raise Exception(f"Manim rendering failed: {error_msg}")
            
            # Find the generated video file
            video_file = self._find_generated_video(output_dir, video_id)
            
            if not video_file:
                raise Exception("Video file not found after rendering")
            
            # Get video information
            file_size_mb = video_file.stat().st_size / (1024 * 1024)
            video_duration = await self._get_video_duration(video_file)
            
            # Create public URL
            video_url = f"/videos/{video_file.name}"
            
            # Clean up temporary script
            try:
                script_path.unlink()
            except Exception:
                pass
            
            logger.info(f"Video generated successfully: {video_file.name}")
            
            return {
                "video_url": video_url,
                "video_id": video_id,
                "topic": topic,
                "duration_seconds": video_duration,
                "file_size_mb": round(file_size_mb, 2),
                "manim_script": script,
                "generation_time_seconds": round(generation_time, 2),
                "local_video_path": str(video_file),
                "has_audio": False,
                "tts_engine": None,
                "narration_preview": None,
                "vtt_url": None,
            }
            
        except Exception as e:
            logger.error(f"Error rendering video: {str(e)}")
            raise Exception(f"Video rendering failed: {str(e)}")
    
    def _find_generated_video(self, output_dir: Path, video_id: str) -> Optional[Path]:
        """Find the generated video file"""
        try:
            # Manim typically creates videos in videos/scene_name/quality/ structure
            possible_paths = [
                output_dir / f"{video_id}.mp4",
                output_dir / "videos" / "scene" / "1080p60" / f"{video_id}.mp4",
                output_dir / "videos" / "ExplanationScene" / "1080p60" / f"{video_id}.mp4"
            ]
            
            # Also search recursively for any mp4 files created in the last minute
            for video_file in output_dir.rglob("*.mp4"):
                if video_file.stat().st_mtime > (datetime.now().timestamp() - 60):  # Created in last minute
                    # Move to main videos directory with our naming
                    new_name = output_dir / f"{video_id}.mp4"
                    if video_file != new_name:
                        video_file.rename(new_name)
                    return new_name
            
            for path in possible_paths:
                if path.exists():
                    return path
            
            return None
            
        except Exception as e:
            logger.error(f"Error finding generated video: {str(e)}")
            return None
    
    async def _get_video_duration(self, video_path: Path) -> Optional[float]:
        """Get video duration using ffprobe if available"""
        try:
            cmd = [
                "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                "-of", "csv=p=0", str(video_path)
            ]
            
            result = await asyncio.to_thread(
                subprocess.run,
                cmd,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                duration = float(result.stdout.strip())
                return duration
            
        except Exception as e:
            logger.debug(f"Could not get video duration: {str(e)}")
        
        return None
    
    def _create_fallback_video_response(self, topic: str, error: str) -> VideoResponse:
        """Create fallback video response when generation fails"""
        return VideoResponse(
            video_url="/static/placeholder_video.mp4",  # Could create a placeholder
            video_id=f"failed_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            topic=topic,
            duration_seconds=None,
            file_size_mb=None,
            manim_script=f"# Video generation failed: {error}",
            generation_time_seconds=0.0,
            has_audio=False,
            tts_engine=None,
            narration_preview=None,
            vtt_url=None,
        )
    
    def is_healthy(self) -> bool:
        """Check if Manim generator is healthy"""
        try:
            # Check if Manim is available
            result = subprocess.run(
                [sys.executable, "-m", "manim", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except Exception:
            return False
    
    async def cleanup_old_videos(self, days_old: int = 7):
        """Clean up old video files to save space"""
        try:
            cutoff_time = datetime.now().timestamp() - (days_old * 24 * 3600)
            
            for video_file in self.videos_dir.glob("*.mp4"):
                if video_file.stat().st_mtime < cutoff_time:
                    try:
                        video_file.unlink()
                        logger.info(f"Cleaned up old video: {video_file.name}")
                    except Exception as e:
                        logger.warning(f"Could not delete {video_file.name}: {str(e)}")
            
        except Exception as e:
            logger.error(f"Error cleaning up videos: {str(e)}")