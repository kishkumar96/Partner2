'use client';

import { useRef, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { CycloneForecastPoint } from '../utils/cycloneAnimationLoader';
import { StoryBeat } from '../utils/cycloneStory';
import { getCategoryColor, getBeatColor, CHART_COLORS, hexToRGBA } from '@/theme/cycloneScale';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface CycloneIntensityChartProps {
  forecastTrack: CycloneForecastPoint[];
  currentIndex: number;
  onPointClick: (index: number) => void;
  isPlaying?: boolean;
  storyBeats?: StoryBeat[];
}

export default function CycloneIntensityChart({
  forecastTrack,
  currentIndex,
  onPointClick,
  storyBeats = [],
}: CycloneIntensityChartProps) {
  const chartRef = useRef<ChartJS<'line'>>(null);
  const animatedIndexRef = useRef(currentIndex);
  const animationFrameRef = useRef<number | null>(null);
  const lastTargetRef = useRef({ index: currentIndex, time: 0 });

  // Create a map of beat indices for quick lookup
  const beatIndices = useMemo(() => {
    const map = new Map<number, StoryBeat>();
    storyBeats.forEach(beat => map.set(beat.index, beat));
    return map;
  }, [storyBeats]);

  // Accessibility label
  const chartAriaLabel = useMemo(() => {
    const maxWind = Math.max(...forecastTrack.map(p => p.meanWind));
    const duration = forecastTrack.length;
    return `Cyclone intensity chart showing wind speed over time. Maximum wind speed: ${maxWind} knots across ${duration} forecast timesteps.`;
  }, [forecastTrack]);

  // Performance optimization: precompute all point presentation data in a single pass
  // Avoids 10+ array.map() operations per render
  const presentationData = useMemo(() => {
    return forecastTrack.map((point, i) => {
      const beat = beatIndices.get(i);
      const isCurrent = i === currentIndex;
      const isBeat = !!beat;

      return {
        // Labels
        label: new Date(point.time).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),

        // Data values
        meanWind: point.meanWind,
        maxGust: Math.max(point.windGust, point.meanWind),
        pressure: point.pressure,

        // Visual properties (precomputed)
        pointRadius: isCurrent ? 8 : isBeat ? 7 : 4,
        pointColor: isCurrent
          ? '#EF4444'
          : beat
            ? getBeatColor(beat.type)
            : getCategoryColor(point.category),
        pointBorderWidth: isBeat ? 3 : 2,
        pointStyle: beat
          ? beat.type === 'peak-intensity'
            ? ('star' as const)
            : beat.type === 'rapid-intensification'
              ? ('triangle' as const)
              : beat.type === 'category-upgrade'
                ? ('rectRot' as const)
                : beat.type === 'closest-approach'
                  ? ('crossRot' as const)
                  : ('circle' as const)
          : ('circle' as const),
      };
    });
  }, [forecastTrack, currentIndex, beatIndices]);

  // Memoize chart data to prevent unnecessary recalculations
  // Now uses precomputed presentation array (single iteration)
  const chartData = useMemo(
    () => ({
      labels: presentationData.map(p => p.label),
      datasets: [
        {
          label: 'Wind Speed (kt)',
          data: presentationData.map(p => p.meanWind),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          fill: false,
          tension: 0.4,
          pointRadius: presentationData.map(p => p.pointRadius),
          pointHoverRadius: 8,
          pointBackgroundColor: presentationData.map(p => p.pointColor),
          pointBorderColor: '#ffffff',
          pointBorderWidth: presentationData.map(p => p.pointBorderWidth),
          pointStyle: presentationData.map(p => p.pointStyle),
        },
        {
          label: 'Gust Range (kt)',
          data: presentationData.map(p => p.maxGust),
          borderColor: 'rgba(59, 130, 246, 0)',
          backgroundColor: CHART_COLORS.windFill,
          fill: '-1',
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 0,
        },
        {
          label: 'Pressure (hPa)',
          data: presentationData.map(p => p.pressure),
          borderColor: CHART_COLORS.pressure,
          backgroundColor: CHART_COLORS.pressureFill,
          fill: true,
          tension: 0.4,
          yAxisID: 'y1',
          pointRadius: 3,
          pointHoverRadius: 6,
        },
      ],
    }),
    [presentationData]
  );

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0,
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    onClick: (_: any, elements: any[]) => {
      if (elements && elements.length > 0 && elements[0].index !== undefined) {
        onPointClick(elements[0].index);
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#ffffff',
          font: {
            size: 10,
          },
          usePointStyle: true,
          padding: 10,
          filter: (item: any) => item.text !== 'Gust Range (kt)',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(30, 40, 60, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#4B5563',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        callbacks: {
          afterBody: (items: any[]) => {
            const idx = items[0].dataIndex;
            const point = forecastTrack[idx];
            const lines = [`Category: ${point.category}`, `Gust: ${point.windGust.toFixed(0)} kt`];

            // Add beat information if this is a story beat
            const beat = beatIndices.get(idx);
            if (beat) {
              lines.push('');
              lines.push(`Story Beat: ${beat.title}`);
              lines.push(beat.description);
            }

            return lines;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#9CA3AF',
          font: {
            size: 9,
          },
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Wind Speed (kt)',
          color: '#3B82F6',
          font: {
            size: 11,
          },
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#9CA3AF',
          font: {
            size: 10,
          },
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Pressure (hPa)',
          color: '#8B5CF6',
          font: {
            size: 11,
          },
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: '#9CA3AF',
          font: {
            size: 10,
          },
        },
        reverse: true,
      },
    },
  };

  const animatorPlugin = useMemo(
    () => ({
      id: 'intensityAnimator',
      afterDatasetsDraw: (chart: ChartJS<'line'>) => {
        const meta = chart.getDatasetMeta(0);
        if (!meta?.data?.length) return;

        const ctx = chart.ctx;
        const count = meta.data.length;
        const index = Math.max(0, Math.min(count - 1, animatedIndexRef.current));
        const floor = Math.floor(index);
        const ceil = Math.min(count - 1, floor + 1);
        const t = index - floor;
        const p1 = meta.data[floor];
        const p2 = meta.data[ceil];
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;

        const now = performance.now();
        const pulse = 0.5 + 0.5 * Math.sin(now / 320);

        ctx.save();

        // Motion blur tail
        const tailLength = 6;
        for (let i = 1; i <= tailLength; i += 1) {
          const idx = Math.max(0, floor - i);
          const tailPoint = meta.data[idx];
          const alpha = ((tailLength - i + 1) / (tailLength + 1)) * 0.35;
          ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(tailPoint.x, tailPoint.y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        // Uncertainty glow around the cursor
        const glowRadius = 12 + pulse * 4;
        ctx.beginPath();
        ctx.fillStyle = `rgba(59, 130, 246, ${0.18 + pulse * 0.12})`;
        ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Beat pulse ring
        const beat = beatIndices.get(Math.round(index));
        if (beat) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.6 - pulse * 0.2})`;
          ctx.lineWidth = 2;
          ctx.arc(x, y, 16 + pulse * 6, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Current point marker
        ctx.beginPath();
        ctx.fillStyle = '#ef4444';
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      },
    }),
    [beatIndices]
  );

  useEffect(() => {
    const now = performance.now();
    const from = animatedIndexRef.current;
    const to = currentIndex;
    const delta = Math.abs(to - from);
    const timeSince = now - (lastTargetRef.current.time || now);
    const velocity = timeSince > 0 ? delta / timeSince : delta;
    const duration = Math.max(180, Math.min(900, 220 + delta * 90 - velocity * 120));

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const start = now;

    const step = (timestamp: number) => {
      const t = Math.min(1, (timestamp - start) / duration);
      const eased = easeOutCubic(t);
      animatedIndexRef.current = from + (to - from) * eased;
      if (chartRef.current) {
        chartRef.current.update('none');
      }
      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      }
    };

    lastTargetRef.current = { index: to, time: now };
    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [currentIndex]);

  return (
    <div className="h-full w-full">
      <Chart
        type="line"
        ref={chartRef}
        data={chartData}
        options={options}
        plugins={[animatorPlugin]}
        aria-label={chartAriaLabel}
      />
    </div>
  );
}
