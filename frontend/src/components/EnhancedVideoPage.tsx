import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Settings, 
  Download,
  Share2,
  BookOpen,
  Lightbulb,
  BarChart3,
  Video,
  Film,
  Zap,
  Clock,
  Eye,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Star,
  MessageSquare
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { apiClient } from '@/utils/api';
import {
  GradeLevel,
  LanguageCode,
  VideoResponse,
  LearningPathRequest,
  LearningPathResponse,
  ConversationResponse
} from '@/types';

interface EnhancedVideoPageProps {
  studentId: string;
  gradeLevel: GradeLevel;
  language?: LanguageCode;
  conversationContext?: ConversationResponse;
}

interface VideoGenerationSettings {
  topic: string;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  format: 'mp4' | 'mov' | 'webm';
  animationStyle: 'classic' | 'modern' | 'colorful' | 'mathematical' | 'visual' | 'kinesthetic';
  targetDuration: number;
  includeInteractiveElements: boolean;
  personalizeForStudent: boolean;
}

interface BatchVideoSettings {
  topics: string[];
  sequenceType: 'linear_progression' | 'branched_exploration' | 'spiral_curriculum';
  totalDuration: number;
  adaptiveDifficulty: boolean;
}

interface VideoAnalytics {
  sessionId: string | null;
  watchTime: number;
  totalDuration: number;
  completionPercentage: number;
  interactions: number;
  engagementLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  confusionIndicators: string[];
  learningIndicators: string[];
}

const EnhancedVideoPage: React.FC<EnhancedVideoPageProps> = ({
  studentId,
  gradeLevel,
  language = 'en',
  conversationContext
}) => {
  // State for video generation
  const [currentVideo, setCurrentVideo] = useState<VideoResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  
  // State for video settings
  const [videoSettings, setVideoSettings] = useState<VideoGenerationSettings>({
    topic: '',
    quality: 'high',
    format: 'mp4',
    animationStyle: 'modern',
    targetDuration: 180,
    includeInteractiveElements: true,
    personalizeForStudent: true
  });

  // State for batch generation
  const [batchSettings, setBatchSettings] = useState<BatchVideoSettings>({
    topics: [],
    sequenceType: 'linear_progression',
    totalDuration: 600,
    adaptiveDifficulty: true
  });
  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<any>(null);

  // State for video playback and analytics
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoAnalytics, setVideoAnalytics] = useState<VideoAnalytics>({
    sessionId: null,
    watchTime: 0,
    totalDuration: 0,
    completionPercentage: 0,
    interactions: 0,
    engagementLevel: 'medium',
    confusionIndicators: [],
    learningIndicators: []
  });

  // State for recommendations and insights
  const [videoRecommendations, setVideoRecommendations] = useState<any[]>([]);
  const [learningInsights, setLearningInsights] = useState<any>(null);

  // State for UI
  const [activeTab, setActiveTab] = useState<'generate' | 'batch' | 'analytics' | 'recommendations'>('generate');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const analyticsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize component
  useEffect(() => {
    loadVideoRecommendations();
    
    // If conversation context provided, pre-fill topic
    if (conversationContext) {
      setVideoSettings(prev => ({
        ...prev,
        topic: conversationContext.response.key_concepts[0] || 'Learning Topic'
      }));
    }

    return () => {
      if (analyticsIntervalRef.current) {
        clearInterval(analyticsIntervalRef.current);
      }
    };
  }, [studentId]);

  // Video analytics tracking
  useEffect(() => {
    if (videoAnalytics.sessionId && isPlaying) {
      analyticsIntervalRef.current = setInterval(() => {
        trackVideoInteraction('play', currentTime);
      }, 10000); // Track every 10 seconds

      return () => {
        if (analyticsIntervalRef.current) {
          clearInterval(analyticsIntervalRef.current);
        }
      };
    }
  }, [videoAnalytics.sessionId, isPlaying, currentTime]);

  const loadVideoRecommendations = async () => {
    try {
      const recommendations = await apiClient.getStudentProfile(studentId);
      // This would be enhanced with actual video recommendation endpoint
      setVideoRecommendations([]);
    } catch (error) {
      console.error('Error loading video recommendations:', error);
    }
  };

  const generateContextualVideo = async () => {
    if (!videoSettings.topic.trim()) {
      toast.error('Please enter a topic for video generation');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setGenerationProgress(prev => Math.min(prev + 10, 90));
      }, 2000);

      const videoData = await apiClient.generateContextualVideo({
        topic: videoSettings.topic,
        student_id: studentId,
        grade_level: gradeLevel,
        language: language,
        conversation_context: conversationContext,
        video_quality: videoSettings.quality,
        video_format: videoSettings.format,
        animation_style: videoSettings.animationStyle,
        target_duration: videoSettings.targetDuration
      });

      clearInterval(progressInterval);
      setCurrentVideo(videoData);
      setGenerationProgress(100);

      // Start video analytics session
      await startVideoSession(videoData.video_id);

      toast.success('Video generated successfully!');

    } catch (error) {
      console.error('Error generating video:', error);
      toast.error('Failed to generate video. Please try again.');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const createBatchGeneration = async () => {
    if (batchSettings.topics.length === 0) {
      toast.error('Please add topics for batch generation');
      return;
    }

    try {
      const batchRequest: LearningPathRequest = {
        student_id: studentId,
        target_topics: batchSettings.topics,
        time_available: batchSettings.totalDuration,
        preferences: {
          sequence_type: batchSettings.sequenceType,
          adaptive_difficulty: batchSettings.adaptiveDifficulty
        }
      };

      const response = await fetch('/api/video/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchRequest)
      });

      if (!response.ok) {
        throw new Error('Batch generation failed');
      }

      const result = await response.json();
      setActiveBatch(result.batch_id);

      // Start polling for batch status
      pollBatchStatus(result.batch_id);

      toast.success('Batch video generation started!');

    } catch (error) {
      console.error('Error creating batch generation:', error);
      toast.error('Failed to start batch generation');
    }
  };

  const pollBatchStatus = async (batchId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/video/batch-status/${batchId}`);
        
        if (response.ok) {
          const status = await response.json();
          setBatchProgress(status);

          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval);
            
            if (status.status === 'completed') {
              toast.success('Batch video generation completed!');
            } else {
              toast.error('Batch video generation failed');
            }
          }
        }
      } catch (error) {
        console.error('Error polling batch status:', error);
      }
    }, 15000); // Poll every 15 seconds

    // Stop polling after 30 minutes
    setTimeout(() => clearInterval(pollInterval), 30 * 60 * 1000);
  };

  const startVideoSession = async (videoId: string) => {
    try {
      const response = await fetch('/api/video/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: videoId,
          student_id: studentId,
          video_metadata: {
            topic: videoSettings.topic,
            grade_level: gradeLevel,
            generation_settings: videoSettings
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        setVideoAnalytics(prev => ({
          ...prev,
          sessionId: result.session_id,
          totalDuration: currentVideo?.duration_seconds || 0
        }));
      }
    } catch (error) {
      console.error('Error starting video session:', error);
    }
  };

  const trackVideoInteraction = async (interactionType: string, videoPosition: number, duration?: number) => {
    if (!videoAnalytics.sessionId) return;

    try {
      await fetch('/api/video/session/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: videoAnalytics.sessionId,
          interaction_type: interactionType,
          video_position: videoPosition,
          duration: duration,
          metadata: {
            engagement_level: videoAnalytics.engagementLevel,
            completion_percentage: videoAnalytics.completionPercentage
          }
        })
      });

      // Update analytics state
      setVideoAnalytics(prev => ({
        ...prev,
        interactions: prev.interactions + 1,
        watchTime: interactionType === 'play' ? prev.watchTime + 1 : prev.watchTime,
        completionPercentage: prev.totalDuration > 0 ? (videoPosition / prev.totalDuration) * 100 : 0
      }));

    } catch (error) {
      console.error('Error tracking video interaction:', error);
    }
  };

  const endVideoSession = async () => {
    if (!videoAnalytics.sessionId) return;

    try {
      const response = await fetch(`/api/video/session/end/${videoAnalytics.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_position: currentTime
        })
      });

      if (response.ok) {
        const result = await response.json();
        setLearningInsights(result.learning_insights);
        
        // Reset analytics
        setVideoAnalytics(prev => ({
          ...prev,
          sessionId: null
        }));
      }
    } catch (error) {
      console.error('Error ending video session:', error);
    }
  };

  const handleVideoPlay = () => {
    setIsPlaying(true);
    if (videoRef.current) {
      videoRef.current.play();
      trackVideoInteraction('play', currentTime);
    }
  };

  const handleVideoPause = () => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      trackVideoInteraction('pause', currentTime);
    }
  };

  const handleVideoSeek = (newTime: number) => {
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      trackVideoInteraction('seek', newTime);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    trackVideoInteraction('complete', currentVideo?.duration_seconds || 0);
    endVideoSession();
  };

  const submitVideoFeedback = async (rating: number, feedbackText?: string) => {
    if (!currentVideo) return;

    try {
      await fetch('/api/video/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: currentVideo.video_id,
          student_id: studentId,
          rating: rating,
          feedback_text: feedbackText
        })
      });

      toast.success('Thank you for your feedback!');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error('Failed to submit feedback');
    }
  };

  const addTopicToBatch = () => {
    const newTopic = prompt('Enter topic for batch generation:');
    if (newTopic && !batchSettings.topics.includes(newTopic)) {
      setBatchSettings(prev => ({
        ...prev,
        topics: [...prev.topics, newTopic]
      }));
    }
  };

  const removeTopicFromBatch = (index: number) => {
    setBatchSettings(prev => ({
      ...prev,
      topics: prev.topics.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Video className="text-blue-600" />
            Enhanced Video Generation
          </h1>
          <div className="flex items-center gap-2 bg-gradient-to-r from-purple-100 to-blue-100 px-4 py-2 rounded-lg">
            <Zap className="w-5 h-5 text-purple-600" />
            <span className="font-medium text-purple-800">Phase 4 - AI Powered</span>
          </div>
        </div>

        <p className="text-gray-600 mb-4">
          Generate personalized educational videos with advanced AI, conversation context integration, 
          and real-time analytics tracking for Grade {gradeLevel} learning.
        </p>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
          {[
            { id: 'generate', label: 'Generate Video', icon: Film },
            { id: 'batch', label: 'Batch Creation', icon: BookOpen },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'recommendations', label: 'Recommendations', icon: Lightbulb }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Video Generation Settings */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Settings className="text-blue-600" />
                  Generation Settings
                </h2>

                {/* Topic Input */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Topic
                    </label>
                    <input
                      type="text"
                      value={videoSettings.topic}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, topic: e.target.value }))}
                      placeholder="Enter the topic you want to learn about..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Quick Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Video Quality
                      </label>
                      <select
                        value={videoSettings.quality}
                        onChange={(e) => setVideoSettings(prev => ({ ...prev, quality: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="low">Low (480p)</option>
                        <option value="medium">Medium (720p)</option>
                        <option value="high">High (1080p)</option>
                        <option value="ultra">Ultra (1440p)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Animation Style
                      </label>
                      <select
                        value={videoSettings.animationStyle}
                        onChange={(e) => setVideoSettings(prev => ({ ...prev, animationStyle: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="classic">Classic Blackboard</option>
                        <option value="modern">Modern & Clean</option>
                        <option value="colorful">Colorful & Engaging</option>
                        <option value="mathematical">Mathematical Focus</option>
                        <option value="visual">Visual Heavy</option>
                        <option value="kinesthetic">Movement Based</option>
                      </select>
                    </div>
                  </div>

                  {/* Advanced Settings Toggle */}
                  <button
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
                  >
                    <Settings className="w-4 h-4" />
                    {showAdvancedSettings ? 'Hide' : 'Show'} Advanced Settings
                  </button>

                  {/* Advanced Settings */}
                  {showAdvancedSettings && (
                    <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Target Duration (seconds)
                          </label>
                          <input
                            type="number"
                            value={videoSettings.targetDuration}
                            onChange={(e) => setVideoSettings(prev => ({ ...prev, targetDuration: parseInt(e.target.value) }))}
                            min="60"
                            max="600"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Format
                          </label>
                          <select
                            value={videoSettings.format}
                            onChange={(e) => setVideoSettings(prev => ({ ...prev, format: e.target.value as any }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="mp4">MP4</option>
                            <option value="mov">MOV</option>
                            <option value="webm">WebM</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={videoSettings.includeInteractiveElements}
                            onChange={(e) => setVideoSettings(prev => ({ ...prev, includeInteractiveElements: e.target.checked }))}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-sm text-gray-700">Include Interactive Elements</span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={videoSettings.personalizeForStudent}
                            onChange={(e) => setVideoSettings(prev => ({ ...prev, personalizeForStudent: e.target.checked }))}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-sm text-gray-700">Personalize for Student</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Generate Button */}
                  <button
                    onClick={generateContextualVideo}
                    disabled={isGenerating || !videoSettings.topic.trim()}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Generating... {generationProgress}%
                      </>
                    ) : (
                      <>
                        <Film className="w-4 h-4" />
                        Generate Video
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Generated Video Display */}
              {currentVideo && (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Play className="text-green-600" />
                    Generated Video: {currentVideo.topic}
                  </h2>

                  <div className="space-y-4">
                    {/* Video Player */}
                    <div className="relative bg-black rounded-lg overflow-hidden">
                      <video
                        ref={videoRef}
                        src={apiClient.getVideoUrl(currentVideo.video_url)}
                        className="w-full h-64 object-cover"
                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        onEnded={handleVideoEnded}
                        crossOrigin="anonymous"
                        controls
                      >
                        <source src={apiClient.getVideoUrl(currentVideo.video_url)} type="video/mp4" />
                      </video>
                    </div>

                    {/* Video Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="flex items-center gap-1 text-blue-600 mb-1">
                          <Clock className="w-4 h-4" />
                          Duration
                        </div>
                        <div className="font-semibold">{Math.floor(currentVideo.duration_seconds / 60)}:{String(currentVideo.duration_seconds % 60).padStart(2, '0')}</div>
                      </div>

                      <div className="bg-green-50 p-3 rounded-lg">
                        <div className="flex items-center gap-1 text-green-600 mb-1">
                          <Eye className="w-4 h-4" />
                          Quality
                        </div>
                        <div className="font-semibold capitalize">{videoSettings.quality}</div>
                      </div>

                      <div className="bg-purple-50 p-3 rounded-lg">
                        <div className="flex items-center gap-1 text-purple-600 mb-1">
                          <TrendingUp className="w-4 h-4" />
                          Style
                        </div>
                        <div className="font-semibold capitalize">{videoSettings.animationStyle}</div>
                      </div>

                      <div className="bg-orange-50 p-3 rounded-lg">
                        <div className="flex items-center gap-1 text-orange-600 mb-1">
                          <Download className="w-4 h-4" />
                          Size
                        </div>
                        <div className="font-semibold">{currentVideo.file_size_mb?.toFixed(1)} MB</div>
                      </div>
                    </div>

                    {/* Video Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {/* Download logic */}}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      <button
                        onClick={() => {/* Share logic */}}
                        className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                      >
                        <Share2 className="w-4 h-4" />
                        Share
                      </button>
                      <button
                        onClick={() => submitVideoFeedback(5)}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                      >
                        <Star className="w-4 h-4" />
                        Rate Video
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Real-time Analytics Sidebar */}
            <div className="space-y-6">
              {/* Live Analytics */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 className="text-blue-600" />
                  Live Analytics
                </h3>

                {videoAnalytics.sessionId ? (
                  <div className="space-y-4">
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-sm text-green-600 mb-1">Watch Progress</div>
                      <div className="text-2xl font-bold text-green-700">
                        {videoAnalytics.completionPercentage.toFixed(0)}%
                      </div>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-sm text-blue-600 mb-1">Engagement</div>
                      <div className="text-lg font-semibold text-blue-700 capitalize">
                        {videoAnalytics.engagementLevel.replace('_', ' ')}
                      </div>
                    </div>

                    <div className="bg-purple-50 p-3 rounded-lg">
                      <div className="text-sm text-purple-600 mb-1">Interactions</div>
                      <div className="text-2xl font-bold text-purple-700">
                        {videoAnalytics.interactions}
                      </div>
                    </div>

                    {videoAnalytics.confusionIndicators.length > 0 && (
                      <div className="bg-orange-50 p-3 rounded-lg">
                        <div className="flex items-center gap-1 text-orange-600 mb-2">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm">Attention Needed</span>
                        </div>
                        <div className="text-sm text-orange-700">
                          {videoAnalytics.confusionIndicators.length} confusion indicators detected
                        </div>
                      </div>
                    )}

                    {videoAnalytics.learningIndicators.length > 0 && (
                      <div className="bg-green-50 p-3 rounded-lg">
                        <div className="flex items-center gap-1 text-green-600 mb-2">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">Learning Progress</span>
                        </div>
                        <div className="text-sm text-green-700">
                          {videoAnalytics.learningIndicators.length} positive learning signals
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>Start watching a video to see live analytics</p>
                  </div>
                )}
              </div>

              {/* Learning Insights */}
              {learningInsights && (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Lightbulb className="text-yellow-600" />
                    Learning Insights
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <div className="text-sm text-gray-600">Learning Outcome</div>
                      <div className="font-semibold capitalize">
                        {learningInsights.learning_outcome?.replace('_', ' ')}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-gray-600">Progression</div>
                      <div className="font-semibold capitalize">
                        {learningInsights.learning_progression}
                      </div>
                    </div>

                    {learningInsights.content_recommendations?.length > 0 && (
                      <div>
                        <div className="text-sm text-gray-600 mb-2">Recommendations</div>
                        <ul className="space-y-1">
                          {learningInsights.content_recommendations.slice(0, 3).map((rec: string, idx: number) => (
                            <li key={idx} className="text-sm text-blue-600 flex items-start gap-1">
                              <span className="text-blue-400 mt-1">•</span>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'batch' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <BookOpen className="text-blue-600" />
              Batch Video Generation
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Batch Settings */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Topics for Learning Path
                  </label>
                  <div className="space-y-2">
                    {batchSettings.topics.map((topic, index) => (
                      <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                        <span className="flex-1">{topic}</span>
                        <button
                          onClick={() => removeTopicFromBatch(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addTopicToBatch}
                      className="w-full p-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600"
                    >
                      + Add Topic
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sequence Type
                    </label>
                    <select
                      value={batchSettings.sequenceType}
                      onChange={(e) => setBatchSettings(prev => ({ ...prev, sequenceType: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="linear_progression">Linear Progression</option>
                      <option value="branched_exploration">Branched Exploration</option>
                      <option value="spiral_curriculum">Spiral Curriculum</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Total Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={batchSettings.totalDuration / 60}
                      onChange={(e) => setBatchSettings(prev => ({ ...prev, totalDuration: parseInt(e.target.value) * 60 }))}
                      min="5"
                      max="120"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={batchSettings.adaptiveDifficulty}
                    onChange={(e) => setBatchSettings(prev => ({ ...prev, adaptiveDifficulty: e.target.checked }))}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Enable Adaptive Difficulty</span>
                </label>

                <button
                  onClick={createBatchGeneration}
                  disabled={batchSettings.topics.length === 0}
                  className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Learning Path Videos
                </button>
              </div>

              {/* Batch Progress */}
              <div>
                {batchProgress ? (
                  <div className="space-y-4">
                    <h3 className="font-semibold">Batch Progress</h3>
                    
                    <div className="bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${batchProgress.progress?.completion_percentage || 0}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>Completed: {batchProgress.progress?.completed || 0}</div>
                      <div>Failed: {batchProgress.progress?.failed || 0}</div>
                      <div>Processing: {batchProgress.progress?.processing || 0}</div>
                      <div>Queued: {batchProgress.progress?.queued || 0}</div>
                    </div>

                    <div className="space-y-2">
                      {batchProgress.video_jobs?.map((job: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <div className={`w-3 h-3 rounded-full ${
                            job.status === 'completed' ? 'bg-green-500' :
                            job.status === 'processing' ? 'bg-blue-500' :
                            job.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                          }`} />
                          <span className="flex-1">{job.topic}</span>
                          <span className="text-sm text-gray-600 capitalize">{job.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : activeBatch ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-gray-600">Initializing batch generation...</p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>Configure topics and settings to start batch generation</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Video Performance Analytics</h2>
              <div className="text-center py-8 text-gray-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Analytics will be displayed here after video generation</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Learning Effectiveness</h2>
              <div className="text-center py-8 text-gray-500">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Learning effectiveness metrics will be shown here</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Personalized Recommendations</h2>
            <div className="text-center py-8 text-gray-500">
              <Lightbulb className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Video recommendations will be loaded based on your learning progress</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedVideoPage;