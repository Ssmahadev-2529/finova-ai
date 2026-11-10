import React from 'react';

interface PayPalLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}

export const PayPalLogo: React.FC<PayPalLogoProps> = ({
  className = '',
  size = 'md',
  showWordmark = false
}) => {
  const dimensions = {
    sm: { w: 18, h: 22 },
    md: { w: 24, h: 28 },
    lg: { w: 32, h: 38 },
  }[size];

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Signature Double-P PayPal Monogram */}
      <svg
        width={dimensions.w}
        height={dimensions.h}
        viewBox="0 0 100 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-sm"
      >
        {/* Back 'P' (Deep Navy / Royal Blue) */}
        <path
          d="M26 10H64C77.5 10 86 19 86 33C86 50 73 63 56 63H39L30 115H10L26 10Z"
          fill="#003087"
        />
        {/* Front overlapping 'P' (Bright Cyan Blue) */}
        <path
          d="M40 32H75C88.5 32 97 41 97 55C97 72 84 85 67 85H50L41 137H21L40 32Z"
          fill="#0079C1"
          opacity="0.92"
        />
        {/* Intersection highlight */}
        <path
          d="M40 32H64C71 32 76.5 35 80 40C77 46 72 50 64 50H47L40 90H28L40 32Z"
          fill="#00457C"
          opacity="0.75"
        />
      </svg>

      {showWordmark && (
        <span className="font-extrabold italic tracking-tight text-white flex items-baseline">
          <span className="text-[#003087] dark:text-[#38BDF8]">Pay</span>
          <span className="text-[#0079C1] dark:text-[#00CFDE]">Pal</span>
        </span>
      )}
    </div>
  );
};
