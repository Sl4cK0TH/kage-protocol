import type React from "react";
import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  full?: boolean;
}

export function Button({ variant = "primary", full, className, ...props }: ButtonProps) {
  const styles = {
    primary: "bg-neon text-ink hover:bg-electric",
    ghost: "border border-slate-600 text-slate-200 hover:border-neon",
    danger: "bg-ember text-white hover:bg-red-500"
  };

  return (
    <button
      className={clsx(
        "px-4 py-2 rounded-lg font-display text-sm uppercase tracking-[0.2em] transition",
        full && "w-full",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <label className="block text-sm text-slate-400 space-y-2">
      {label ? <span className="uppercase tracking-[0.2em] text-xs text-slate-500">{label}</span> : null}
      <input
        className={clsx(
          "w-full rounded-lg border border-slate-700 bg-ink/60 px-3 py-2 text-slate-100 focus:border-neon focus:outline-none",
          className
        )}
        {...props}
      />
    </label>
  );
}

interface PanelProps {
  title: string;
  children: React.ReactNode;
}

export function Panel({ title, children }: PanelProps) {
  return (
    <section className="panel rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg text-white">{title}</h3>
      </div>
      {children}
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: string;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="panel rounded-2xl p-5 space-y-2">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="text-3xl font-display text-white">{value}</p>
    </div>
  );
}

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/80" onClick={onClose} />
      <div className="relative panel max-w-2xl w-full rounded-2xl p-6 space-y-4 animate-in">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-white">{title}</h3>
          <button className="text-slate-400 hover:text-neon" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
}

export function Select({ value, options, placeholder, onChange }: SelectProps) {
  return (
    <select
      className="w-full rounded-lg border border-slate-700 bg-ink/60 px-3 py-2 text-slate-100 focus:border-neon focus:outline-none"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="" disabled>
        {placeholder || "Select"}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
