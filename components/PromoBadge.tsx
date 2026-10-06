import React from 'react';
import { Promotion, promoBadgeLabel } from '../lib/promotions';

interface PromoBadgeProps {
  promotion: Promotion;
  size?: 'sm' | 'md';
  className?: string;
}

export const PromoBadge: React.FC<PromoBadgeProps> = ({ promotion, size = 'sm', className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full bg-rose-500 text-white shadow-sm shadow-rose-950/50 font-black whitespace-nowrap shrink-0 ${size === 'md' ? 'px-3 py-1 text-[12px]' : 'px-2 py-0.5 text-[10px]'} ${className}`}
  >
    <span className="material-symbols-outlined leading-none" style={{ fontSize: size === 'md' ? '15px' : '12px' }}>sell</span>
    {promoBadgeLabel(promotion)}
  </span>
);
