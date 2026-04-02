import React, { type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'primary',
  size = 'md',
  children,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

  const variants = {
    primary: 'bg-green-600 text-black hover:bg-green-500 shadow-[0_0_10px_rgba(22,163,74,0.5)] font-bold tracking-wide',
    secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700',
    outline: 'border border-green-500/50 text-green-500 hover:bg-green-500/10 hover:border-green-500 hover:shadow-[0_0_10px_rgba(22,163,74,0.3)] bg-transparent',
    ghost: 'text-slate-400 hover:text-white hover:bg-white/5',
    danger: 'bg-red-600/90 text-white hover:bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.5)]',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 py-2 text-sm',
    lg: 'h-12 px-8 text-base',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
};
