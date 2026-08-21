import React, { useEffect, useState } from 'react';
import { Text, TextStyle } from 'react-native';

interface Props {
  value: number;
  duration?: number;
  style?: TextStyle | TextStyle[];
  formatter?: (val: number) => string;
}

export default function CountingNumber({ value, duration = 1200, style, formatter }: Props) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = 0;
    let animationFrameId: number;
    
    if (value === 0) {
      setDisplayValue(0);
      return;
    }

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      setDisplayValue(startValue + (value - startValue) * easeProgress);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [value, duration]);

  const formattedValue = formatter ? formatter(displayValue) : displayValue.toFixed(0);

  return <Text style={style}>{formattedValue}</Text>;
}
