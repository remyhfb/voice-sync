import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface QualityMeterProps {
  quality: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showTooltip?: boolean;
}

export function QualityMeter({ 
  quality, 
  size = "md",
  showLabel = true,
  showTooltip = true
}: QualityMeterProps) {
  const sizeMap = {
    sm: { circle: 80, stroke: 8, text: "text-lg", label: "text-xs" },
    md: { circle: 120, stroke: 10, text: "text-2xl", label: "text-sm" },
    lg: { circle: 160, stroke: 12, text: "text-4xl", label: "text-base" },
  };

  const { circle: size_px, stroke, text: textSize, label: labelSize } = sizeMap[size];
  const radius = (size_px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (quality / 100) * circumference;

  const getQualityColor = () => {
    if (quality >= 90) return "stroke-chart-2";
    if (quality >= 70) return "stroke-chart-4";
    return "stroke-destructive";
  };

  const getQualityLabel = () => {
    if (quality >= 90) return "Excellent";
    if (quality >= 70) return "Good";
    return "Fair";
  };

  const meter = (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size_px, height: size_px }}>
        <svg
          className="transform -rotate-90"
          width={size_px}
          height={size_px}
        >
          <circle
            className="stroke-muted"
            strokeWidth={stroke}
            fill="transparent"
            r={radius}
            cx={size_px / 2}
            cy={size_px / 2}
          />
          <circle
            className={cn("transition-all duration-1000", getQualityColor())}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size_px / 2}
            cy={size_px / 2}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-bold", textSize)} data-testid="text-quality-percentage">
            {quality}%
          </span>
          {showLabel && (
            <span className={cn("text-muted-foreground font-medium", labelSize)}>
              {getQualityLabel()}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (!showTooltip) return meter;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative inline-block">
          {meter}
          <div className="absolute -top-1 -right-1">
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-sm max-w-xs">
          Voice quality measures how closely the cloned voice matches the original samples.
          Higher scores indicate better preservation of tone, emotion, and natural inflection.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
