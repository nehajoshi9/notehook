import React from 'react';
import { File, FishingHook } from 'lucide-react';
import { BRAND_COLORS } from '@/lib/color';

interface NotehookLogoProps {
  className?: string;
}

export const NotehookLogo: React.FC<NotehookLogoProps> = ({
  className = '',
}) => {
  return (
    <div className={`relative flex items-center justify-center ${BRAND_COLORS.logo} ${BRAND_COLORS.logoHover} transition-colors duration-150 ${className} shrink-0 select-none`}>
      {/* File Page shifted lower */}
      <File className="w-[80%] h-[80%] absolute top-[11%] right-[6%]" strokeWidth={2} />
      {/* Fishing Hook */}
      <FishingHook
        className="w-[52%] h-[52%] absolute bottom-[1%] left-[1%] -rotate-15"
        strokeWidth={2.4}
      />
    </div>
  );
};
