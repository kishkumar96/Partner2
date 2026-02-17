/**
 * Story Beat Annotation Component
 *
 * Displays contextual annotations on the map during cyclone story mode.
 * Provides narrative text that explains what's happening at key moments
 * in the cyclone's lifecycle.
 */

'use client';

import { useEffect, useState } from 'react';
import { StoryBeat } from '@/utils/cycloneStory';
import { CycloneForecastPoint } from '@/utils/cycloneAnimationLoader';
import { TrendingUp, Wind, AlertTriangle, MapPin, Activity } from 'lucide-react';

interface StoryBeatAnnotationProps {
  /** Current cyclone data point */
  currentPoint: CycloneForecastPoint;
  /** All detected story beats */
  storyBeats: StoryBeat[];
  /** Current timestep index */
  currentIndex: number;
  /** Whether annotations should be shown */
  visible: boolean;
}

/**
 * Get annotation text for each beat type
 */
function getBeatAnnotation(
  beat: StoryBeat,
  point: CycloneForecastPoint
): {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
} {
  const time = new Date(point.time).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  switch (beat.type) {
    case 'peak-intensity':
      return {
        title: 'Peak Intensity',
        description:
          beat.description ||
          `Maximum strength reached with winds of ${point.windGust.toFixed(0)} kt and pressure of ${point.pressure.toFixed(0)} hPa`,
        icon: Activity,
      };

    case 'rapid-intensification':
      return {
        title: 'Rapid Intensification',
        description:
          beat.description ||
          `Cyclone rapidly strengthening - wind speeds increasing dramatically as conditions favor explosive development`,
        icon: TrendingUp,
      };

    case 'category-upgrade':
      return {
        title: `Upgraded to Category ${point.category}`,
        description:
          beat.description ||
          `Cyclone intensifies to Category ${point.category} status at ${time}. Dangerous conditions developing.`,
        icon: Wind,
      };

    case 'closest-approach':
      return {
        title: 'Closest Approach',
        description:
          beat.description ||
          `Cyclone making closest approach to populated areas. Prepare for maximum impacts.`,
        icon: MapPin,
      };

    case 'peak-uncertainty':
      return {
        title: 'High Forecast Uncertainty',
        description:
          beat.description ||
          `Forecast confidence decreases due to complex atmospheric conditions. Monitor latest updates closely.`,
        icon: AlertTriangle,
      };

    default:
      return {
        title: beat.title || 'Key Moment',
        description: beat.description || `Significant event in cyclone development at ${time}`,
        icon: Activity,
      };
  }
}

export default function StoryBeatAnnotation({
  currentPoint,
  storyBeats,
  currentIndex,
  visible,
}: StoryBeatAnnotationProps) {
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<StoryBeat | null>(null);

  // Check if we're at a story beat and show annotation
  useEffect(() => {
    if (!visible) {
      // Delay state update to avoid synchronous setState
      Promise.resolve().then(() => setShowAnnotation(false));
      return;
    }

    // Find beat at current index
    const beatAtCurrentIndex = storyBeats.find(beat => beat.index === currentIndex);

    if (beatAtCurrentIndex) {
      setCurrentBeat(beatAtCurrentIndex);
      setShowAnnotation(true);

      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShowAnnotation(false);
      }, 5000);

      return () => clearTimeout(timer);
    } else {
      setShowAnnotation(false);
      setCurrentBeat(null);
    }
  }, [currentIndex, storyBeats, visible]);

  if (!showAnnotation || !currentBeat) {
    return null;
  }

  const annotation = getBeatAnnotation(currentBeat, currentPoint);
  const IconComponent = annotation.icon;

  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[25] pointer-events-none max-w-md animate-fadeSlide">
      <div
        className="glass-panel rounded-lg px-6 py-4 border-2 shadow-2xl"
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          borderColor: 'rgba(59, 130, 246, 0.5)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 60px rgba(59, 130, 246, 0.2)',
        }}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(59, 130, 246, 0.2)',
              border: '2px solid rgba(59, 130, 246, 0.5)',
            }}
          >
            <IconComponent className="w-5 h-5 text-blue-400" />
          </div>

          {/* Content */}
          <div className="flex-1">
            <h3 className="text-base font-semibold text-white mb-1">{annotation.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{annotation.description}</p>
          </div>

          {/* Beat indicator */}
          <div className="flex-shrink-0">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: 'rgba(59, 130, 246, 0.3)',
                color: '#60A5FA',
                border: '1px solid rgba(59, 130, 246, 0.5)',
              }}
            >
              {storyBeats.findIndex(b => b.index === currentBeat.index) + 1}
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        <div
          className="absolute bottom-0 left-0 h-1 rounded-b-lg bg-blue-500 animate-shrink"
          style={{
            width: '100%',
            animation: 'shrink 5s linear forwards',
          }}
        />
      </div>

      <style jsx>{`
        @keyframes fadeSlide {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }

        .animate-fadeSlide {
          animation: fadeSlide 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
