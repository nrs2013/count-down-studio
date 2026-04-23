import { useState, useRef, useCallback } from "react";
import { UI_FONT, MONO_FONT, INPUT_STYLES, ACCENT_COLORS, filterTimeInput, parseDuration, formatDuration } from "@/lib/time-utils";

function useIMEGuard() {
  const imeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const onCompositionStart = useCallback(() => {
    imeRef.current = true;
    clearTimeout(timerRef.current);
  }, []);

  const onCompositionEnd = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { imeRef.current = false; }, 300);
  }, []);

  const isIME = useCallback((e: React.KeyboardEvent) => {
    return e.nativeEvent.isComposing || e.keyCode === 229 || imeRef.current;
  }, []);

  return { onCompositionStart, onCompositionEnd, isIME };
}

interface StyledInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onFocusField?: () => void;
  placeholder?: string;
  className?: string;
  testId?: string;
  accent?: keyof typeof ACCENT_COLORS;
  mono?: boolean;
  autoFocus?: boolean;
  bold?: boolean;
}

export function StyledInput({
  value,
  onChange,
  onBlur,
  onKeyDown,
  onFocusField,
  placeholder,
  className = "",
  testId,
  accent = "default",
  mono,
  autoFocus,
  bold,
}: StyledInputProps) {
  const accentColor = ACCENT_COLORS[accent] || ACCENT_COLORS.default;
  const { onCompositionStart, onCompositionEnd, isIME } = useIMEGuard();

  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      onKeyDown={onKeyDown || ((e) => {
        if (isIME(e)) return;
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      })}
      placeholder={placeholder}
      className={`bg-transparent text-white ${bold ? "text-base" : "text-sm"} ${mono ? "px-1.5" : "px-2"} py-1 h-[38px] rounded-sm focus:outline-none transition-all duration-200 placeholder:text-white/15 ${className}`}
      style={{
        fontFamily: mono ? MONO_FONT : UI_FONT,
        border: INPUT_STYLES.border,
        background: INPUT_STYLES.background,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = accentColor;
        e.currentTarget.style.boxShadow = INPUT_STYLES.glowFocused(accentColor);
        onFocusField?.();
      }}
      onBlurCapture={(e) => {
        e.currentTarget.style.borderColor = INPUT_STYLES.borderBlur;
        e.currentTarget.style.boxShadow = "none";
      }}
      autoFocus={autoFocus}
      data-testid={testId}
    />
  );
}

interface TimeInputProps {
  value: string;
  onChange: (val: string) => void;
  onBlur: () => void;
  onFocusField?: () => void;
  placeholder?: string;
  className?: string;
  testId?: string;
  color?: string;
  disabled?: boolean;
}

export function TimeInput({
  value,
  onChange,
  onBlur,
  onFocusField,
  placeholder = "0:00",
  className = "",
  testId,
  color,
  disabled,
}: TimeInputProps) {
  const accentColor = ACCENT_COLORS.fuchsia;
  const composingRef = useRef(false);
  const imeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [focused, setFocused] = useState(false);

  const hasValue = value !== "";
  const hasNonZeroValue = hasValue && value !== "0:00" && value !== "00:00";
  const showAsConfirmed = hasNonZeroValue || (hasValue && !!color);
  const activeColor = (showAsConfirmed && !focused) ? (color || "rgba(255,255,255,0.9)") : "rgba(255,255,255,0.35)";

  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={value}
      onChange={(e) => {
        if (composingRef.current) {
          onChange(e.target.value);
        } else {
          onChange(filterTimeInput(e.target.value));
        }
      }}
      onCompositionStart={() => { composingRef.current = true; clearTimeout(imeTimerRef.current); }}
      onCompositionEnd={(e) => {
        clearTimeout(imeTimerRef.current);
        imeTimerRef.current = setTimeout(() => { composingRef.current = false; }, 300);
        onChange(filterTimeInput((e.target as HTMLInputElement).value));
      }}
      onBlur={(e) => {
        setFocused(false);
        const cleaned = filterTimeInput(e.target.value);
        const parsed = parseDuration(cleaned);
        if (parsed !== null) {
          onChange(formatDuration(parsed));
        } else {
          onChange(cleaned);
        }
        onBlur();
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229 || composingRef.current) return;
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className={`w-[60px] text-center text-base px-0.5 h-[38px] rounded-sm focus:outline-none transition-all duration-200 placeholder:text-white/15 shrink-0 ${className}`}
      style={{
        fontFamily: MONO_FONT,
        border: INPUT_STYLES.border,
        background: INPUT_STYLES.background,
        color: activeColor,
      }}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.style.borderColor = accentColor;
        e.currentTarget.style.boxShadow = INPUT_STYLES.glowFocused(accentColor);
        const el = e.currentTarget;
        const val = el.value;
        if (val === "0:00" || val === "00:00") {
          onChange("");
        } else {
          el.select();
        }
        onFocusField?.();
      }}
      onBlurCapture={(e) => {
        e.currentTarget.style.borderColor = INPUT_STYLES.borderBlur;
        e.currentTarget.style.boxShadow = "none";
      }}
      data-testid={testId}
    />
  );
}

export { useIMEGuard };

interface StyledSelectProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  hasValue?: boolean;
}

export function StyledSelect({
  value,
  onChange,
  children,
  className = "",
  testId,
  hasValue = false,
}: StyledSelectProps) {
  const accentColor = ACCENT_COLORS.fuchsia;

  return (
    <select
      value={value}
      onChange={(e) => {
        onChange(e);
        e.currentTarget.style.color = e.currentTarget.value ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)";
      }}
      tabIndex={-1}
      className={`text-base py-1 h-[38px] rounded-sm focus:outline-none transition-all duration-200 appearance-none cursor-pointer ${className}`}
      style={{
        fontFamily: UI_FONT,
        background: INPUT_STYLES.background,
        border: INPUT_STYLES.border,
        color: hasValue ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)",
        textAlign: "center",
        textAlignLast: "center",
        paddingLeft: "4px",
        paddingRight: "4px",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = accentColor;
        e.currentTarget.style.boxShadow = INPUT_STYLES.glowFocused(accentColor);
        e.currentTarget.style.color = "rgba(255,255,255,0.9)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = INPUT_STYLES.borderBlur;
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.color = e.currentTarget.value ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)";
      }}
      data-testid={testId}
    >
      {children}
    </select>
  );
}
