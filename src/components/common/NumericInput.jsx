import React from 'react';

/**
 * Reusable Numeric Input component that eliminates leading zero bugs.
 * Shows placeholder="0" when value is 0 or empty, and strips leading zeros on input (e.g. "015" -> "15").
 */
export default function NumericInput({
  value,
  onChange,
  onFocus,
  placeholder = "0",
  className = "",
  step,
  min,
  max,
  ...props
}) {
  // If value is 0, '0', null, or undefined, render empty string to display clean placeholder
  const displayValue = (value === 0 || value === '0' || value === null || value === undefined || value === '') ? '' : value;

  const handleChange = (e) => {
    let raw = e.target.value;

    // Strip leading zeroes if followed by non-decimal digits (e.g. "015" -> "15", but keep "0.5")
    if (raw.length > 1 && raw.startsWith('0') && raw[1] !== '.') {
      raw = raw.replace(/^0+(?=\d)/, '');
    }

    onChange(raw);
  };

  const handleFocus = (e) => {
    setTimeout(() => {
      if (e.target && typeof e.target.select === 'function') {
        e.target.select();
      }
    }, 10);
    if (onFocus) onFocus(e);
  };

  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      value={displayValue}
      onFocus={handleFocus}
      onChange={handleChange}
      className={className}
      {...props}
    />
  );
}
