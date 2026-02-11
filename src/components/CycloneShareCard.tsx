'use client';

import { useRef, useEffect, useState } from 'react';
import { X, Download, Copy, Check } from 'lucide-react';
import { CycloneForecastPoint, getCategoryColor, getCategoryLabel } from '../utils/cycloneAnimationLoader';

interface CycloneShareCardProps {
  cycloneData: CycloneForecastPoint[];
  currentIndex: number;
  onClose: () => void;
}

export default function CycloneShareCard({
  cycloneData,
  currentIndex,
  onClose,
}: CycloneShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  
  const currentPoint = cycloneData[currentIndex];
  
  // Generate text summary
  const generateTextSummary = (): string => {
    const date = new Date(currentPoint.time).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    return `🌀 Tropical Cyclone Update

${getCategoryLabel(currentPoint.category)}
${date}

💨 Wind: ${Math.round(currentPoint.meanWind)} kt (sustained)
🌪️ Gusts: ${Math.round(currentPoint.windGust)} kt
🌡️ Pressure: ${Math.round(currentPoint.pressure)} hPa
📍 Position: ${currentPoint.latitude.toFixed(2)}°${currentPoint.latitude >= 0 ? 'N' : 'S'}, ${currentPoint.longitude.toFixed(2)}°${currentPoint.longitude >= 0 ? 'E' : 'W'}

#TropicalCyclone #Weather #DisasterPreparedness`;
  };
  
  // Draw card to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = 800;
    const height = 600;
    canvas.width = width;
    canvas.height = height;
    
    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0b1220');
    bgGradient.addColorStop(1, '#1e283a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);
    
    // Category color accent bar
    const categoryColor = getCategoryColor(currentPoint.category);
    ctx.fillStyle = categoryColor;
    ctx.fillRect(0, 0, 10, height);
    
    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px Arial';
    ctx.fillText('🌀 Tropical Cyclone', 40, 70);
    
    // Category badge
    const categoryLabel = getCategoryLabel(currentPoint.category);
    ctx.fillStyle = categoryColor;
    ctx.fillRect(40, 90, 200, 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(categoryLabel, 140, 123);
    ctx.textAlign = 'left';
    
    // Timestamp
    const date = new Date(currentPoint.time);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '18px Arial';
    ctx.fillText(date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }), 40, 165);
    
    // Primary metrics box
    const metricsY = 210;
    
    // Wind box
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.fillRect(40, metricsY, 220, 100);
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('SUSTAINED WIND', 50, metricsY + 25);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial';
    ctx.fillText(`${Math.round(currentPoint.meanWind)}`, 50, metricsY + 75);
    ctx.font = '20px Arial';
    ctx.fillText('kt', 160, metricsY + 75);
    
    // Gust box
    ctx.fillStyle = 'rgba(139, 92, 246, 0.2)';
    ctx.fillRect(280, metricsY, 220, 100);
    ctx.fillStyle = '#8b5cf6';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('GUSTS', 290, metricsY + 25);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial';
    ctx.fillText(`${Math.round(currentPoint.windGust)}`, 290, metricsY + 75);
    ctx.font = '20px Arial';
    ctx.fillText('kt', 400, metricsY + 75);
    
    // Pressure box
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.fillRect(520, metricsY, 240, 100);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('PRESSURE', 530, metricsY + 25);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial';
    ctx.fillText(`${Math.round(currentPoint.pressure)}`, 530, metricsY + 75);
    ctx.font = '20px Arial';
    ctx.fillText('hPa', 680, metricsY + 75);
    
    // Position
    const posY = 340;
    ctx.fillStyle = '#9ca3af';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('POSITION', 40, posY);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    const lat = `${Math.abs(currentPoint.latitude).toFixed(2)}°${currentPoint.latitude >= 0 ? 'N' : 'S'}`;
    const lon = `${Math.abs(currentPoint.longitude).toFixed(2)}°${currentPoint.longitude >= 0 ? 'E' : 'W'}`;
    ctx.fillText(`${lat}, ${lon}`, 40, posY + 35);
    
    // Mini sparkline of wind history
    if (currentIndex > 0) {
      const sparklineY = 420;
      const sparklineHeight = 80;
      const sparklineWidth = 720;
      
      ctx.fillStyle = '#4b5563';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('WIND HISTORY', 40, sparklineY);
      
      // Draw sparkline
      const historyPoints = cycloneData.slice(0, currentIndex + 1);
      const maxWind = Math.max(...historyPoints.map(p => p.meanWind));
      const minWind = Math.min(...historyPoints.map(p => p.meanWind));
      const windRange = maxWind - minWind || 1;
      
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      historyPoints.forEach((point, i) => {
        const x = 40 + (i / (historyPoints.length - 1 || 1)) * sparklineWidth;
        const normalizedWind = (point.meanWind - minWind) / windRange;
        const y = sparklineY + 30 + (1 - normalizedWind) * sparklineHeight;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      
      // Current point highlight
      const lastX = 40 + sparklineWidth;
      const lastNormalized = (currentPoint.meanWind - minWind) / windRange;
      const lastY = sparklineY + 30 + (1 - lastNormalized) * sparklineHeight;
      
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(lastX, lastY, 5, 0, 2 * Math.PI);
      ctx .fill();
    }
    
    // Footer
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px Arial';
    ctx.fillText('Generated by Pacific Disaster Impact Explorer', 40, height - 30);
    
  }, [cycloneData, currentIndex, currentPoint]);
  
  // Copy text summary to clipboard
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateTextSummary());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  // Download canvas as PNG
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `cyclone-moment-${new Date(currentPoint.time).toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 rounded-2xl p-4 sm:p-8 w-full max-w-4xl max-h-[95vh] overflow-y-auto my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Share Cyclone Moment</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>
        
        {/* Canvas Preview */}
        <div className="mb-6 rounded-lg overflow-hidden border border-slate-700">
          <canvas ref={canvasRef} className="w-full h-auto" />
        </div>
        
        {/* Actions */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={handleCopyText}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-white transition-colors"
          >
            {copied ? <Check size={20} /> : <Copy size={20} />}
            {copied ? 'Copied!' : 'Copy Text Summary'}
          </button>
          
          <button
            onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <Download size={20} />
            Download PNG
          </button>
        </div>
        
        {/* Preview Text */}
        <div className="mt-6 pt-6 border-t border-slate-700">
          <p className="text-sm text-slate-400 mb-2">Text Summary Preview:</p>
          <pre className="text-xs text-slate-300 bg-slate-800/80 rounded-lg p-4 whitespace-pre-wrap">
            {generateTextSummary()}
          </pre>
        </div>
      </div>
    </div>
  );
}
