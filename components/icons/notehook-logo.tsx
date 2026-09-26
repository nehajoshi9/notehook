import React from 'react';
import { File, FishingHook } from 'lucide-react';

interface NotehookLogoProps {
  className?: string;
}

export const NotehookLogo: React.FC<NotehookLogoProps> = ({
  className = 'w-8 h-8',
}) => {
  return (
    <div className={`relative flex items-center justify-center ${className} shrink-0`}>
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
