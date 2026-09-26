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
      {/* File Page shifted slightly up-right to keep the combined composition centered */}
      <File className="w-[80%] h-[80%] absolute top-[6%] right-[6%]" strokeWidth={2} />
      {/* Fishing Hook moved a few pixels to the left (left-[1%]) */}
      <FishingHook
        className="w-[52%] h-[52%] absolute bottom-[4%] left-[1%] -rotate-15"
        strokeWidth={2.4}
      />
    </div>
  );
};
