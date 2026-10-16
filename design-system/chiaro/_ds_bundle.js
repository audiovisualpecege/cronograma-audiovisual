/* @ds-bundle: {"format":4,"namespace":"ChiaroFilmesDesignSystem_7fe4c8","components":[{"name":"EchoTitle","sourcePath":"components/brand/EchoTitle.jsx"},{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"SectionTitle","sourcePath":"components/brand/SectionTitle.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"Dialog","sourcePath":"components/surfaces/Dialog.jsx"},{"name":"MediaCard","sourcePath":"components/surfaces/MediaCard.jsx"},{"name":"Toast","sourcePath":"components/surfaces/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/surfaces/Tooltip.jsx"}],"sourceHashes":{"components/brand/EchoTitle.jsx":"6a9012a27265","components/brand/Logo.jsx":"ce77e0d69442","components/brand/SectionTitle.jsx":"ba164fd0d697","components/core/Badge.jsx":"8efd04b6e275","components/core/Button.jsx":"3b470a9190c5","components/core/Icon.jsx":"aa9df53a4be6","components/core/IconButton.jsx":"587cce3477d5","components/core/Tag.jsx":"962d46b06b4f","components/forms/Checkbox.jsx":"eb07b1d9c74a","components/forms/Input.jsx":"38d5f9a62fe6","components/forms/Radio.jsx":"b7afbdaeaaa7","components/forms/Select.jsx":"1c654a09c6f0","components/forms/Switch.jsx":"8c22d1cb4b42","components/navigation/Tabs.jsx":"320fb5d63513","components/surfaces/Card.jsx":"e0370743c3a8","components/surfaces/Dialog.jsx":"6e3a30c27787","components/surfaces/MediaCard.jsx":"1ebeb3a2c4a2","components/surfaces/Toast.jsx":"5d8603600204","components/surfaces/Tooltip.jsx":"7b214626bb57","ui_kits/midia-kit/Slides.jsx":"36b426da2ef7","ui_kits/site/SiteBottom.jsx":"b9234c358691","ui_kits/site/SiteMid.jsx":"4eb61fad2a5a","ui_kits/site/SiteTop.jsx":"7cb053ca430d"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ChiaroFilmesDesignSystem_7fe4c8 = window.ChiaroFilmesDesignSystem_7fe4c8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/EchoTitle.jsx
try { (() => {
function EchoTitle({
  text,
  repeat = 5,
  size = 72,
  color = 'var(--chiaro-violeta)',
  align = 'center',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    "aria-label": text,
    style: {
      textAlign: align,
      ...style
    }
  }, Array.from({
    length: repeat
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    "aria-hidden": i > 0,
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: size,
      lineHeight: .9,
      textTransform: 'uppercase',
      color,
      opacity: i === repeat - 1 ? 1 : 0.25 + 0.75 * (i / (repeat - 1)),
      clipPath: i === 0 ? 'inset(45% 0 0 0)' : undefined
    }
  }, text)));
}
Object.assign(__ds_scope, { EchoTitle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/EchoTitle.jsx", error: String((e && e.message) || e) }); }

// components/brand/Logo.jsx
try { (() => {
const FILES = {
  box: 'chiaro-box',
  boxHorizontal: 'chiaro-box-horizontal',
  chiaro: 'chiaro',
  filmes: 'chiaro-filmes',
  filmesHorizontal: 'chiaro-filmes-horizontal',
  icon: 'icone-chiaro'
};
function Logo({
  variant = 'filmesHorizontal',
  inverse,
  height = 32,
  base = '',
  style
}) {
  const f = FILES[variant] + (inverse ? '-white' : '');
  return /*#__PURE__*/React.createElement("img", {
    src: base + 'assets/logos/' + f + '.png',
    alt: "Chiaro Filmes",
    style: {
      height,
      width: 'auto',
      display: 'block',
      ...style
    }
  });
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// components/brand/SectionTitle.jsx
try { (() => {
function SectionTitle({
  light,
  bold,
  eyebrow,
  size = 64,
  color = 'var(--text-brand)',
  align = 'left',
  as = 'h2',
  style
}) {
  const H = as;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: align,
      ...style
    }
  }, eyebrow && /*#__PURE__*/React.createElement("div", {
    style: {
      font: '800 16px var(--font-display)',
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: 'var(--text-primary)',
      marginBottom: 12
    }
  }, eyebrow), /*#__PURE__*/React.createElement(H, {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: size,
      lineHeight: .95,
      textTransform: 'uppercase',
      color,
      letterSpacing: '-.005em'
    }
  }, light && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 300
    }
  }, light, bold ? ' ' : ''), bold && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800
    }
  }, bold)));
}
Object.assign(__ds_scope, { SectionTitle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/SectionTitle.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function Badge({
  tone = 'brand',
  children,
  style
}) {
  const T = {
    brand: ['var(--chiaro-violeta)', '#fff'],
    soft: ['var(--accent-soft)', 'var(--text-brand)'],
    warm: ['var(--chiaro-pessego)', 'var(--chiaro-noite)'],
    dark: ['var(--chiaro-noite)', '#fff'],
    live: ['var(--danger)', '#fff'],
    success: ['var(--success)', '#fff']
  }[tone];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 22,
      padding: '0 10px',
      borderRadius: 'var(--radius-pill)',
      background: T[0],
      color: T[1],
      font: '800 11px/1 var(--font-display)',
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      ...style
    }
  }, tone === 'live' && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 9,
      background: '#fff'
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CDN = 'https://cdn.jsdelivr.net/npm/@solar-icons/static@2.3.2/dist/icons/';
function Icon({
  name,
  weight = 'linear',
  size = 20,
  color = 'currentColor',
  style,
  ...rest
}) {
  const url = 'url(' + CDN + weight + '/' + name + '.svg)';
  return /*#__PURE__*/React.createElement("span", _extends({
    "aria-hidden": "true"
  }, rest, {
    style: {
      display: 'inline-block',
      flex: 'none',
      width: size,
      height: size,
      background: color,
      WebkitMask: url + ' center/contain no-repeat',
      mask: url + ' center/contain no-repeat',
      ...style
    }
  }));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    h: 36,
    px: 16,
    fs: 13,
    ic: 16
  },
  md: {
    h: 44,
    px: 22,
    fs: 15,
    ic: 18
  },
  lg: {
    h: 56,
    px: 30,
    fs: 17,
    ic: 20
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  disabled,
  fullWidth,
  children,
  style,
  onClick,
  type = 'button',
  ...rest
}) {
  const [h, setH] = React.useState(false);
  const [p, setP] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const V = {
    primary: {
      bg: p ? 'var(--accent-press)' : h ? 'var(--accent-hover)' : 'var(--accent)',
      fg: 'var(--text-on-brand)',
      bd: 'transparent'
    },
    secondary: {
      bg: h ? 'var(--accent-soft)' : 'transparent',
      fg: 'var(--text-brand)',
      bd: 'var(--border-brand)'
    },
    ghost: {
      bg: h ? 'var(--accent-soft)' : 'transparent',
      fg: 'var(--text-primary)',
      bd: 'transparent'
    },
    light: {
      bg: h ? 'var(--chiaro-areia)' : '#fff',
      fg: 'var(--chiaro-noite)',
      bd: 'transparent'
    },
    gradient: {
      bg: 'var(--gradient-chiaro)',
      fg: '#fff',
      bd: 'transparent'
    }
  }[variant] || {};
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => {
      setH(false);
      setP(false);
    },
    onMouseDown: () => setP(true),
    onMouseUp: () => setP(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: s.h,
      padding: '0 ' + s.px + 'px',
      width: fullWidth ? '100%' : undefined,
      borderRadius: 'var(--radius-pill)',
      border: '1.5px solid ' + V.bd,
      background: V.bg,
      backgroundOrigin: 'border-box',
      backgroundClip: 'border-box',
      color: V.fg,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: s.fs,
      letterSpacing: '.02em',
      textTransform: 'uppercase',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .4 : 1,
      transform: p && !disabled ? 'scale(.98)' : 'none',
      boxShadow: variant === 'gradient' && h ? 'var(--shadow-glow)' : 'none',
      filter: variant === 'gradient' && h ? 'brightness(1.08)' : 'none',
      transition: 'background var(--dur-fast) var(--ease-cine), transform var(--dur-fast) var(--ease-cine), box-shadow var(--dur-base) var(--ease-cine)',
      ...style
    }
  }, rest), iconLeft && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconLeft,
    size: s.ic
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: s.ic
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function IconButton({
  icon,
  weight = 'linear',
  label,
  variant = 'ghost',
  size = 44,
  disabled,
  onClick,
  style
}) {
  const [h, setH] = React.useState(false);
  const V = {
    ghost: {
      bg: h ? 'var(--accent-soft)' : 'transparent',
      fg: 'var(--text-primary)',
      bd: 'transparent'
    },
    solid: {
      bg: h ? 'var(--accent-hover)' : 'var(--accent)',
      fg: '#fff',
      bd: 'transparent'
    },
    outline: {
      bg: h ? 'var(--accent-soft)' : 'transparent',
      fg: 'var(--text-brand)',
      bd: 'var(--border-brand)'
    },
    glass: {
      bg: h ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.16)',
      fg: '#fff',
      bd: 'rgba(255,255,255,.3)'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("button", {
    "aria-label": label,
    title: label,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      width: size,
      height: size,
      borderRadius: 'var(--radius-pill)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: V.bg,
      color: V.fg,
      border: '1.5px solid ' + V.bd,
      backdropFilter: variant === 'glass' ? 'blur(var(--blur-glass))' : undefined,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .4 : 1,
      transition: 'background var(--dur-fast) var(--ease-cine)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    weight: weight,
    size: Math.round(size * 0.45)
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function Tag({
  selected,
  onClick,
  onRemove,
  children,
  style
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 32,
      padding: '0 14px',
      borderRadius: 'var(--radius-pill)',
      cursor: onClick ? 'pointer' : 'default',
      background: selected ? 'var(--accent)' : h && onClick ? 'var(--accent-soft)' : 'transparent',
      color: selected ? '#fff' : 'var(--text-primary)',
      border: '1.5px solid ' + (selected ? 'var(--accent)' : 'var(--border-strong)'),
      font: '500 13px var(--font-body)',
      transition: 'all var(--dur-fast) var(--ease-cine)',
      ...style
    }
  }, children, onRemove && /*#__PURE__*/React.createElement("span", {
    onClick: e => {
      e.stopPropagation();
      onRemove();
    },
    style: {
      display: 'inline-flex',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "close",
    size: 14
  })));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  name: n,
  value
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .45 : 1,
      font: '400 15px var(--font-body)',
      color: 'var(--text-primary)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    name: n,
    value: value,
    checked: !!checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 6,
      border: '1.5px solid ' + (checked ? 'var(--accent)' : 'var(--border-strong)'),
      background: checked ? 'var(--accent)' : 'var(--surface-card)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all var(--dur-fast) var(--ease-cine)',
      flex: 'none'
    }
  }, checked && /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }))), label);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const labelStyle = {
  display: 'block',
  font: '700 12px var(--font-display)',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
  marginBottom: 8
};
const boxStyle = (f, err, dis) => ({
  width: '100%',
  boxSizing: 'border-box',
  height: 48,
  padding: '0 16px',
  borderRadius: 'var(--radius-control)',
  border: '1.5px solid ' + (err ? 'var(--danger)' : f ? 'var(--accent)' : 'var(--border-strong)'),
  background: dis ? 'var(--surface-sunken)' : 'var(--surface-card)',
  color: 'var(--text-primary)',
  font: '400 15px var(--font-body)',
  outline: 'none',
  boxShadow: f ? 'var(--focus-ring)' : 'none',
  transition: 'border-color var(--dur-fast) var(--ease-cine), box-shadow var(--dur-fast) var(--ease-cine)'
});
function Input({
  label,
  hint,
  error,
  multiline,
  rows = 4,
  style,
  disabled,
  ...rest
}) {
  const [f, setF] = React.useState(false);
  const El = multiline ? 'textarea' : 'input';
  const b = boxStyle(f, error, disabled);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: labelStyle
  }, label), /*#__PURE__*/React.createElement(El, _extends({}, rest, {
    rows: multiline ? rows : undefined,
    disabled: disabled,
    onFocus: e => {
      setF(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setF(false);
      rest.onBlur && rest.onBlur(e);
    },
    style: {
      ...b,
      ...(multiline ? {
        height: 'auto',
        padding: '12px 16px',
        resize: 'vertical',
        lineHeight: 1.5
      } : {})
    }
  })), (error || hint) && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 6,
      font: '400 12px var(--font-body)',
      color: error ? 'var(--danger)' : 'var(--text-secondary)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function Radio({
  checked,
  onChange,
  label,
  disabled,
  name: n,
  value
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .45 : 1,
      font: '400 15px var(--font-body)',
      color: 'var(--text-primary)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: n,
    value: value,
    checked: !!checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: '50%',
      border: '1.5px solid ' + (checked ? 'var(--accent)' : 'var(--border-strong)'),
      background: 'var(--surface-card)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all var(--dur-fast) var(--ease-cine)',
      flex: 'none'
    }
  }, checked && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: 'var(--accent)'
    }
  })), label);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
const labelStyle = {
  display: 'block',
  font: '700 12px var(--font-display)',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
  marginBottom: 8
};
const boxStyle = (f, err, dis) => ({
  width: '100%',
  boxSizing: 'border-box',
  height: 48,
  padding: '0 16px',
  borderRadius: 'var(--radius-control)',
  border: '1.5px solid ' + (err ? 'var(--danger)' : f ? 'var(--accent)' : 'var(--border-strong)'),
  background: dis ? 'var(--surface-sunken)' : 'var(--surface-card)',
  color: 'var(--text-primary)',
  font: '400 15px var(--font-body)',
  outline: 'none',
  boxShadow: f ? 'var(--focus-ring)' : 'none',
  transition: 'border-color var(--dur-fast) var(--ease-cine), box-shadow var(--dur-fast) var(--ease-cine)'
});
function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder,
  disabled,
  style
}) {
  const [f, setF] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: labelStyle
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: onChange,
    disabled: disabled,
    onFocus: () => setF(true),
    onBlur: () => setF(false),
    style: {
      ...boxStyle(f, false, disabled),
      appearance: 'none',
      paddingRight: 44,
      cursor: 'pointer'
    }
  }, placeholder && /*#__PURE__*/React.createElement("option", {
    value: ""
  }, placeholder), options.map(o => typeof o === 'string' ? /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o) : /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "alt-arrow-down",
    size: 18,
    style: {
      position: 'absolute',
      right: 16,
      top: 15,
      pointerEvents: 'none',
      color: 'var(--text-brand)'
    }
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({
  checked,
  onChange,
  label,
  disabled
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .45 : 1,
      font: '400 15px var(--font-body)',
      color: 'var(--text-primary)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    role: "switch",
    "aria-checked": !!checked,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 44,
      height: 26,
      borderRadius: 999,
      background: checked ? 'var(--accent)' : 'var(--neutral-300)',
      position: 'relative',
      transition: 'background var(--dur-base) var(--ease-cine)',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: checked ? 21 : 3,
      width: 20,
      height: 20,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: 'var(--shadow-sm)',
      transition: 'left var(--dur-base) var(--ease-cine)'
    }
  })), label);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  items = [],
  value,
  onChange,
  variant = 'underline',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: 'flex',
      gap: variant === 'pill' ? 6 : 28,
      padding: variant === 'pill' ? 4 : 0,
      borderRadius: variant === 'pill' ? 999 : 0,
      background: variant === 'pill' ? 'var(--surface-sunken)' : 'transparent',
      borderBottom: variant === 'underline' ? '1px solid var(--border-subtle)' : 'none',
      width: variant === 'pill' ? 'fit-content' : undefined,
      ...style
    }
  }, items.map(it => {
    const k = it.value ?? it;
    const l = it.label ?? it;
    const on = k === value;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      role: "tab",
      "aria-selected": on,
      onClick: () => onChange && onChange(k),
      style: variant === 'pill' ? {
        height: 36,
        padding: '0 18px',
        borderRadius: 999,
        border: 0,
        cursor: 'pointer',
        background: on ? 'var(--accent)' : 'transparent',
        color: on ? '#fff' : 'var(--text-secondary)',
        font: '700 13px var(--font-display)',
        letterSpacing: '.03em',
        textTransform: 'uppercase',
        transition: 'all var(--dur-fast) var(--ease-cine)'
      } : {
        padding: '0 0 12px',
        marginBottom: -1,
        border: 0,
        borderBottom: '2px solid ' + (on ? 'var(--accent)' : 'transparent'),
        background: 'none',
        cursor: 'pointer',
        color: on ? 'var(--text-brand)' : 'var(--text-secondary)',
        font: (on ? 800 : 300) + ' 15px var(--font-display)',
        letterSpacing: '.03em',
        textTransform: 'uppercase',
        transition: 'all var(--dur-fast) var(--ease-cine)'
      }
    }, l);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function Card({
  variant = 'default',
  padding = 24,
  interactive,
  onClick,
  children,
  style
}) {
  const [h, setH] = React.useState(false);
  const V = {
    default: {
      bg: 'var(--surface-card)',
      bd: '1px solid var(--border-subtle)',
      sh: 'var(--shadow-sm)'
    },
    raised: {
      bg: 'var(--surface-raised)',
      bd: '1px solid transparent',
      sh: 'var(--shadow-md)'
    },
    noite: {
      bg: 'var(--chiaro-noite)',
      bd: '1px solid rgba(255,255,255,.08)',
      sh: 'none',
      fg: '#fff'
    },
    warm: {
      bg: 'var(--chiaro-areia)',
      bd: '1px solid transparent',
      sh: 'none'
    },
    brand: {
      bg: 'var(--gradient-chiaro)',
      bd: '1px solid transparent',
      sh: 'none',
      fg: '#fff'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      background: V.bg,
      border: V.bd,
      color: V.fg,
      borderRadius: 'var(--radius-card)',
      padding,
      boxShadow: interactive && h ? 'var(--shadow-lg)' : V.sh,
      transform: interactive && h ? 'translateY(-2px)' : 'none',
      cursor: interactive ? 'pointer' : undefined,
      transition: 'box-shadow var(--dur-base) var(--ease-cine), transform var(--dur-base) var(--ease-cine)',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Dialog.jsx
try { (() => {
function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(7,0,16,.62)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      maxWidth: width,
      background: 'var(--surface-card)',
      color: 'var(--text-primary)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-lg)',
      padding: 32,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "close",
    label: "Fechar",
    onClick: onClose,
    size: 40,
    style: {
      position: 'absolute',
      top: 16,
      right: 16
    }
  }), title && /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 40px 12px 0',
      font: '800 26px/1.05 var(--font-display)',
      textTransform: 'uppercase',
      color: 'var(--text-brand)'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      font: '400 15px/1.6 var(--font-body)',
      color: 'var(--text-secondary)'
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      justifyContent: 'flex-end',
      marginTop: 28
    }
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/MediaCard.jsx
try { (() => {
function MediaCard({
  image,
  title,
  eyebrow,
  meta,
  playable,
  ratio = '16 / 10',
  onClick,
  style
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("figure", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      margin: 0,
      position: 'relative',
      borderRadius: 'var(--radius-photo)',
      overflow: 'hidden',
      aspectRatio: ratio,
      background: 'var(--chiaro-noite)',
      cursor: onClick ? 'pointer' : undefined,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'url(' + image + ')',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      transform: h ? 'scale(1.04)' : 'scale(1)',
      transition: 'transform var(--dur-scene) var(--ease-out)'
    }
  }), (title || eyebrow) && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--gradient-protecao)'
    }
  }), playable && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      width: 64,
      height: 64,
      borderRadius: 999,
      background: h ? 'var(--chiaro-lavanda)' : 'rgba(255,255,255,.18)',
      backdropFilter: 'blur(var(--blur-glass))',
      border: '1.5px solid rgba(255,255,255,.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      transition: 'background var(--dur-base) var(--ease-cine)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "play",
    weight: "bold",
    size: 26
  })), (title || eyebrow) && /*#__PURE__*/React.createElement("figcaption", {
    style: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 18,
      color: '#fff'
    }
  }, eyebrow && /*#__PURE__*/React.createElement("div", {
    style: {
      font: '800 11px var(--font-display)',
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--chiaro-pessego)',
      marginBottom: 6
    }
  }, eyebrow), title && /*#__PURE__*/React.createElement("div", {
    style: {
      font: '700 22px/1.1 var(--font-display)',
      textTransform: 'uppercase'
    }
  }, title), meta && /*#__PURE__*/React.createElement("div", {
    style: {
      font: '400 13px var(--font-body)',
      opacity: .8,
      marginTop: 6
    }
  }, meta)));
}
Object.assign(__ds_scope, { MediaCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/MediaCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Toast.jsx
try { (() => {
function Toast({
  tone = 'default',
  title,
  message,
  onClose,
  style
}) {
  const ic = {
    default: 'stars-minimalistic',
    success: 'check',
    danger: 'danger-triangle'
  }[tone];
  const c = {
    default: 'var(--chiaro-lavanda)',
    success: 'var(--success)',
    danger: 'var(--danger)'
  }[tone];
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      width: 360,
      maxWidth: '100%',
      padding: '14px 16px',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--chiaro-noite)',
      color: '#fff',
      boxShadow: 'var(--shadow-lg)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 999,
      background: c,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: ic,
    weight: "bold",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      font: '700 14px var(--font-display)'
    }
  }, title), message && /*#__PURE__*/React.createElement("div", {
    style: {
      font: '400 13px/1.45 var(--font-body)',
      color: '#B9B1CC',
      marginTop: 2
    }
  }, message)), onClose && /*#__PURE__*/React.createElement("span", {
    onClick: onClose,
    style: {
      cursor: 'pointer',
      opacity: .6,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "close",
    size: 16
  })));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Toast.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Tooltip.jsx
try { (() => {
function Tooltip({
  label,
  children,
  placement = 'top'
}) {
  const [o, setO] = React.useState(false);
  const pos = placement === 'top' ? {
    bottom: 'calc(100% + 8px)'
  } : {
    top: 'calc(100% + 8px)'
  };
  return /*#__PURE__*/React.createElement("span", {
    onMouseEnter: () => setO(true),
    onMouseLeave: () => setO(false),
    style: {
      position: 'relative',
      display: 'inline-flex'
    }
  }, children, /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      position: 'absolute',
      left: '50%',
      ...pos,
      transform: 'translateX(-50%) translateY(' + (o ? 0 : 4) + 'px)',
      opacity: o ? 1 : 0,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      padding: '6px 10px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--chiaro-noite)',
      color: '#fff',
      font: '500 12px var(--font-body)',
      transition: 'opacity var(--dur-fast) var(--ease-cine), transform var(--dur-fast) var(--ease-cine)',
      zIndex: 50
    }
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Tooltip.jsx", error: String((e && e.message) || e) }); }

// ui_kits/midia-kit/Slides.jsx
try { (() => {
const {
  SectionTitle,
  EchoTitle,
  MediaCard,
  Tabs,
  Button,
  Logo,
  Icon,
  Badge
} = window.ChiaroFilmesDesignSystem_7fe4c8;
const IMG = '../../assets/imagery/';
const mkStyles = {
  light: {
    position: 'absolute',
    inset: 0,
    background: 'var(--chiaro-nevoa)',
    color: 'var(--chiaro-grafite)',
    padding: '110px 70px 70px',
    boxSizing: 'border-box'
  },
  dark: {
    position: 'absolute',
    inset: 0,
    background: 'var(--chiaro-noite)',
    color: '#fff',
    overflow: 'hidden'
  },
  overline: {
    position: 'absolute',
    top: 56,
    left: 70,
    font: '800 22px var(--font-display)',
    textTransform: 'uppercase',
    color: '#fff',
    letterSpacing: '.02em',
    zIndex: 3
  },
  body: {
    font: '400 24px/1.45 var(--font-body)',
    maxWidth: 1500,
    margin: '18px 0 34px',
    textWrap: 'pretty'
  }
};
function Capa() {
  return /*#__PURE__*/React.createElement("div", {
    style: mkStyles.dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: `url(${IMG}capa-claquete.jpg) center/cover`
    }
  }));
}
function QuemSomos() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...mkStyles.light,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 380px'
    }
  }, /*#__PURE__*/React.createElement(EchoTitle, {
    text: "Quem somos",
    repeat: 5,
    size: 118
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: '400 26px/1.5 var(--font-body)',
      textAlign: 'center',
      marginTop: 40,
      textWrap: 'pretty'
    }
  }, "N\xF3s acreditamos que imagens falam mais alto que palavras e, apesar disso, n\xE3o medimos palavras para encantar o mundo. Somos uma produtora audiovisual dedicada a criar solu\xE7\xF5es que n\xE3o apenas resolvem as necessidades de comunica\xE7\xE3o de nossos clientes, mas tamb\xE9m superam expectativas com projetos que combinam excel\xEAncia t\xE9cnica e criatividade. Desde a concep\xE7\xE3o at\xE9 a entrega, cada detalhe \xE9 cuidadosamente tratado para garantir que cada produ\xE7\xE3o seja t\xE3o impressionante quanto as hist\xF3rias que contamos."));
}
function Servico({
  image,
  cols
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: mkStyles.dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: `url(${IMG}${image}) center/cover`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg,rgba(7,0,16,0) 55%,rgba(7,0,16,.85) 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: mkStyles.overline
  }, "Nossos servi\xE7os"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 340,
      right: 340,
      bottom: 70,
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 44,
      font: '400 22px/1.4 var(--font-body)',
      textAlign: 'justify'
    }
  }, cols.map((c, i) => /*#__PURE__*/React.createElement("p", {
    key: i,
    style: {
      margin: 0
    },
    dangerouslySetInnerHTML: {
      __html: c
    }
  }))));
}
function Espaco({
  light,
  bold,
  text,
  images
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: mkStyles.light
  }, /*#__PURE__*/React.createElement(SectionTitle, {
    light: light,
    bold: bold,
    size: 112
  }), /*#__PURE__*/React.createElement("p", {
    style: mkStyles.body
  }, text), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${images.length},1fr)`,
      gap: 28,
      height: 620
    }
  }, images.map(src => /*#__PURE__*/React.createElement(MediaCard, {
    key: src,
    image: IMG + src,
    ratio: "auto",
    style: {
      height: '100%',
      boxShadow: 'var(--shadow-md)'
    }
  }))));
}
function Producoes({
  onPlay
}) {
  const cats = ['Institucional', 'Motion', 'Aftermovie', 'In Company'];
  const [cat, setCat] = React.useState('Institucional');
  const thumbs = {
    Institucional: ['producao-externa.jpg', 'estudio-mirante-1.jpg', 'camarim-2.jpg'],
    Motion: ['clientes-tvs.png', 'estudio-ar-2.jpg', 'capa-claquete.jpg'],
    Aftermovie: ['transmissoes.jpg', 'estudio-ar-1.jpg', 'estudio-terra-1.jpg'],
    'In Company': ['estudio-agua-1.jpg', 'estudio-fogo-2.jpg', 'producao-externa.jpg']
  }[cat];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...mkStyles.dark,
      background: 'var(--gradient-noite)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: mkStyles.overline
  }, "Nossas produ\xE7\xF5es"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 150,
      left: 70,
      right: 70,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    "data-theme": "noite"
  }, /*#__PURE__*/React.createElement(Tabs, {
    variant: "pill",
    items: cats,
    value: cat,
    onChange: setCat,
    style: {
      transform: 'scale(1.5)',
      transformOrigin: 'left center'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      font: '600 22px/1.25 var(--font-body)',
      textAlign: 'right'
    }
  }, "Clique nas imagens", /*#__PURE__*/React.createElement("br", null), "para ver os v\xEDdeos.")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 70,
      top: 250,
      font: '900 230px/.9 var(--font-display)',
      textTransform: 'uppercase',
      color: 'var(--chiaro-lavanda)',
      opacity: .9,
      transform: 'rotate(-8deg) skewX(-6deg)',
      transformOrigin: 'left',
      whiteSpace: 'nowrap',
      textShadow: '0 14px 0 #402B6D, 0 28px 60px rgba(0,0,0,.6)'
    }
  }, cat), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 420,
      right: 70,
      bottom: 70,
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 28
    }
  }, thumbs.map(t => /*#__PURE__*/React.createElement(MediaCard, {
    key: cat + t,
    image: IMG + t,
    ratio: "16 / 10",
    playable: true,
    onClick: () => onPlay(cat),
    style: {
      boxShadow: 'var(--shadow-lg)'
    }
  }))));
}
function Clientes() {
  return /*#__PURE__*/React.createElement("div", {
    style: mkStyles.dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: `url(${IMG}clientes-tvs.png) center/cover`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 110,
      top: '50%',
      transform: 'translateY(-50%)'
    }
  }, /*#__PURE__*/React.createElement(SectionTitle, {
    light: "Nossos",
    bold: "Clientes",
    size: 130,
    color: "#fff",
    style: {
      maxWidth: 600
    }
  })));
}
function Contato() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...mkStyles.dark,
      background: 'var(--gradient-noite)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 40
    }
  }, /*#__PURE__*/React.createElement(EchoTitle, {
    text: "Contato",
    repeat: 3,
    size: 150,
    color: "var(--chiaro-lavanda)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 14,
      font: '400 34px var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "mailto:contato@chiarofilmes.com",
    style: {
      color: '#fff',
      display: 'flex',
      gap: 14,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "letter",
    weight: "bold-duotone",
    size: 32,
    color: "var(--chiaro-pessego)"
  }), "contato@chiarofilmes.com"), /*#__PURE__*/React.createElement("a", {
    href: "tel:+5519996556356",
    style: {
      color: '#fff',
      display: 'flex',
      gap: 14,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "phone",
    weight: "bold-duotone",
    size: 32,
    color: "var(--chiaro-pessego)"
  }), "+55 19 99655-6356")), /*#__PURE__*/React.createElement(Logo, {
    variant: "filmesHorizontal",
    inverse: true,
    height: 34,
    base: "../../",
    style: {
      position: 'absolute',
      bottom: 70
    }
  }));
}
Object.assign(window, {
  Capa,
  QuemSomos,
  Servico,
  Espaco,
  Producoes,
  Clientes,
  Contato
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/midia-kit/Slides.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/SiteBottom.jsx
try { (() => {
const DSC = window.ChiaroFilmesDesignSystem_7fe4c8;
const SERV_OPTS = ['Produção externa', 'Transmissão ao vivo', 'Gravação em estúdio', 'Cobertura de evento'];
function Contato({
  espaco
}) {
  const [form, setForm] = React.useState({
    nome: '',
    email: '',
    tel: '',
    espaco: '',
    msg: ''
  });
  const [servs, setServs] = React.useState([]);
  const [err, setErr] = React.useState({});
  const [sent, setSent] = React.useState(false);
  React.useEffect(() => {
    if (espaco) setForm(f => ({
      ...f,
      espaco
    }));
  }, [espaco]);
  const set = k => e => setForm({
    ...form,
    [k]: e.target.value
  });
  const toggle = s => setServs(v => v.includes(s) ? v.filter(x => x !== s) : [...v, s]);
  const submit = e => {
    e.preventDefault();
    const er = {};
    if (!form.nome.trim()) er.nome = 'Conte pra gente seu nome';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Informe um e-mail válido';
    if (!form.msg.trim()) er.msg = 'Escreva uma mensagem';
    setErr(er);
    if (!Object.keys(er).length) {
      setSent(true);
      setTimeout(() => setSent(false), 5000);
      setForm({
        nome: '',
        email: '',
        tel: '',
        espaco: '',
        msg: ''
      });
      setServs([]);
    }
  };
  return /*#__PURE__*/React.createElement("section", {
    id: "contato",
    "data-screen-label": "Contato",
    style: {
      background: 'var(--gradient-noite)',
      color: '#fff',
      padding: '128px 0 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...siteStyles.wrap,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))',
      gap: 64,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: siteStyles.overline
  }, "Vamos criar juntos"), /*#__PURE__*/React.createElement(DSC.SectionTitle, {
    light: "Conte sua",
    bold: "hist\xF3ria",
    size: 72,
    color: "#fff",
    style: {
      marginTop: 14
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      ...siteStyles.body,
      color: '#B9B1CC',
      margin: '24px 0 40px',
      maxWidth: 420
    }
  }, "Fale com a gente sobre seu projeto. Respondemos em at\xE9 24 horas para alinhar cada detalhe."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      font: '400 18px var(--font-body)'
    }
  }, [['letter', 'contato@chiarofilmes.com', 'mailto:contato@chiarofilmes.com'], ['phone', '+55 19 99655-6356', 'tel:+5519996556356'], ['camera-square', '@chiarofilmes', 'https://instagram.com/chiarofilmes']].map(([i, l, h]) => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: h,
    style: {
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 999,
      background: 'rgba(140,78,219,.22)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(DSC.Icon, {
    name: i,
    weight: "bold-duotone",
    size: 20,
    color: "var(--chiaro-pessego)"
  })), l)))), /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    noValidate: true,
    style: {
      background: '#fff',
      color: 'var(--text-primary)',
      borderRadius: 'var(--radius-xl)',
      padding: 40,
      boxShadow: 'var(--shadow-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(DSC.Input, {
    label: "Nome",
    placeholder: "Seu nome",
    value: form.nome,
    onChange: set('nome'),
    error: err.nome
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(DSC.Input, {
    label: "E-mail",
    type: "email",
    placeholder: "voce@empresa.com",
    value: form.email,
    onChange: set('email'),
    error: err.email
  }), /*#__PURE__*/React.createElement(DSC.Input, {
    label: "Telefone",
    placeholder: "+55 19",
    value: form.tel,
    onChange: set('tel')
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      font: '700 12px var(--font-display)',
      letterSpacing: '.04em',
      textTransform: 'uppercase',
      marginBottom: 12
    }
  }, "Servi\xE7os de interesse"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
      gap: 12
    }
  }, SERV_OPTS.map(s => /*#__PURE__*/React.createElement(DSC.Checkbox, {
    key: s,
    checked: servs.includes(s),
    onChange: () => toggle(s),
    label: s
  })))), /*#__PURE__*/React.createElement(DSC.Select, {
    label: "Espa\xE7o",
    placeholder: "Nenhum / ainda n\xE3o sei",
    options: ESPACOS.map(e => e.id === 'Camarim' ? e.id : 'Estúdio ' + e.id),
    value: form.espaco,
    onChange: set('espaco')
  }), /*#__PURE__*/React.createElement(DSC.Input, {
    label: "Mensagem",
    multiline: true,
    rows: 4,
    placeholder: "Conte um pouco sobre seu projeto, datas e formato",
    value: form.msg,
    onChange: set('msg'),
    error: err.msg
  }), /*#__PURE__*/React.createElement(DSC.Button, {
    type: "submit",
    size: "lg",
    fullWidth: true,
    iconRight: "arrow-right"
  }, "Enviar mensagem"))), /*#__PURE__*/React.createElement("footer", {
    style: {
      ...siteStyles.wrap,
      marginTop: 120,
      padding: '40px var(--page-margin)',
      borderTop: '1px solid rgba(255,255,255,.1)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 24,
      flexWrap: 'wrap',
      color: '#857C9C',
      font: '400 13px var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    variant: "filmesHorizontal",
    inverse: true,
    height: 18,
    base: BASE
  }), /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Chiaro Filmes \xB7 chiarofilmes.com")), sent && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      right: 24,
      bottom: 24,
      zIndex: 60
    }
  }, /*#__PURE__*/React.createElement(DSC.Toast, {
    tone: "success",
    title: "Mensagem enviada",
    message: "Respondemos em at\xE9 24h.",
    onClose: () => setSent(false)
  })));
}
Object.assign(window, {
  Contato
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/SiteBottom.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/SiteMid.jsx
try { (() => {
const DS = window.ChiaroFilmesDesignSystem_7fe4c8;
const ESPACOS = [{
  id: 'Mirante',
  area: '140m²',
  imgs: ['estudio-mirante-1.jpg'],
  d: 'Espaço versátil para a montagem de diferentes cenários personalizados de acordo com as necessidades do cliente.',
  feats: ['Cenários personalizados', 'Grandes produções', 'Eventos e gravações']
}, {
  id: 'Água',
  area: '42m²',
  imgs: ['estudio-agua-1.jpg', 'estudio-agua-2.jpg'],
  d: 'Ideal para gravação ou transmissão de cursos e treinamentos.',
  feats: ['Cabine de corte', 'Chroma Key', 'Púlpito e quadro branco']
}, {
  id: 'Fogo',
  area: '42m²',
  imgs: ['estudio-fogo-1.jpg', 'estudio-fogo-2.jpg'],
  d: 'Ideal para gravação ou transmissão de cursos e treinamentos.',
  feats: ['Cabine de corte', 'Chroma Key', 'Púlpito e quadro branco']
}, {
  id: 'Terra',
  area: '40m²',
  imgs: ['estudio-terra-1.jpg', 'estudio-terra-2.jpg'],
  d: 'Ideal para gravação ou transmissão de cursos e treinamentos.',
  feats: ['Cabine de corte', 'Chroma Key', 'Púlpito e quadro branco']
}, {
  id: 'Ar',
  area: '40m²',
  imgs: ['estudio-ar-1.jpg', 'estudio-ar-2.jpg'],
  d: 'Cenografia modular, moderna e versátil — de cursos e treinamentos a entrevistas e eventos.',
  feats: ['TV 85" The Frame', 'Lousa digital', 'Cenografia modular']
}, {
  id: 'Camarim',
  area: '32m²',
  imgs: ['camarim-1.jpg', 'camarim-2.jpg'],
  d: 'Ambiente acolhedor e confortável para os convidados, com copa equipada, sala de estar e banheiros com chuveiro.',
  feats: ['Copa com Nespresso', 'Sala de estar', 'Banheiros dedicados']
}];
function Espacos() {
  const [cur, setCur] = React.useState('Mirante');
  const [img, setImg] = React.useState(0);
  const e = ESPACOS.find(x => x.id === cur);
  React.useEffect(() => setImg(0), [cur]);
  return /*#__PURE__*/React.createElement("section", {
    id: "espacos",
    "data-screen-label": "Espa\xE7os",
    style: {
      background: 'var(--chiaro-nevoa)',
      padding: '128px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: siteStyles.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 32,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(DS.SectionTitle, {
    eyebrow: "Nossos espa\xE7os",
    light: "Cinco est\xFAdios,",
    bold: "um camarim",
    size: 64
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      ...siteStyles.body,
      maxWidth: 400,
      color: 'var(--text-secondary)'
    }
  }, "Estrutura completa para gravar ou transmitir, com equipe t\xE9cnica e suporte do in\xEDcio ao fim.")), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '48px 0 32px',
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement(DS.Tabs, {
    items: ESPACOS.map(x => x.id),
    value: cur,
    onChange: setCur
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)',
      gap: 32,
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(DS.MediaCard, {
    image: IMG + e.imgs[img],
    ratio: "16 / 10",
    style: {
      boxShadow: 'var(--shadow-md)'
    }
  }), e.imgs.length > 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 16,
      bottom: 16,
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(DS.IconButton, {
    icon: "alt-arrow-left",
    label: "Anterior",
    variant: "glass",
    size: 40,
    onClick: () => setImg((img + e.imgs.length - 1) % e.imgs.length)
  }), /*#__PURE__*/React.createElement(DS.IconButton, {
    icon: "alt-arrow-right",
    label: "Pr\xF3xima",
    variant: "glass",
    size: 40,
    onClick: () => setImg((img + 1) % e.imgs.length)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: 'var(--radius-lg)',
      padding: 36,
      boxShadow: 'var(--shadow-sm)',
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(DS.Badge, {
    tone: "soft"
  }, e.area), e.id !== 'Camarim' && /*#__PURE__*/React.createElement(DS.Badge, {
    tone: "warm"
  }, "Est\xFAdio")), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 48,
      lineHeight: .95,
      textTransform: 'uppercase',
      color: 'var(--text-brand)'
    }
  }, e.id === 'Camarim' ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800
    }
  }, "Camarim") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 300
    }
  }, "Est\xFAdio "), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800
    }
  }, e.id))), /*#__PURE__*/React.createElement("p", {
    style: {
      ...siteStyles.body,
      color: 'var(--text-secondary)'
    }
  }, e.d), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, e.feats.map(f => /*#__PURE__*/React.createElement("li", {
    key: f,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      font: '500 15px var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement(DS.Icon, {
    name: "check-circle",
    size: 20,
    color: "var(--chiaro-violeta)"
  }), f))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto'
    }
  }, /*#__PURE__*/React.createElement(DS.Button, {
    variant: "secondary",
    iconRight: "arrow-right",
    onClick: () => window.__goContato(e.id)
  }, "Reservar este espa\xE7o"))))));
}
function Sobre() {
  return /*#__PURE__*/React.createElement("section", {
    id: "sobre",
    "data-screen-label": "Quem somos",
    style: {
      background: '#fff',
      padding: '0 0 128px',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...siteStyles.wrap,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 40
    }
  }, /*#__PURE__*/React.createElement(DS.EchoTitle, {
    text: "Quem somos",
    repeat: 4,
    size: 88,
    style: {
      marginTop: -40
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      ...siteStyles.body,
      fontSize: 20,
      maxWidth: 760
    }
  }, "N\xF3s acreditamos que imagens falam mais alto que palavras e, apesar disso, n\xE3o medimos palavras para encantar o mundo. Somos uma produtora audiovisual dedicada a criar solu\xE7\xF5es que ", /*#__PURE__*/React.createElement("b", null, "superam expectativas"), ", combinando excel\xEAncia t\xE9cnica e criatividade."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap',
      justifyContent: 'center'
    }
  }, ['Versátil', 'Influente', 'Dedicada', 'Audaciosa', 'Sensível'].map(w => /*#__PURE__*/React.createElement(DS.Tag, {
    key: w
  }, w)))));
}
Object.assign(window, {
  Espacos,
  Sobre,
  ESPACOS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/SiteMid.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/SiteTop.jsx
try { (() => {
const {
  Button,
  IconButton,
  Badge,
  Tabs,
  MediaCard,
  SectionTitle,
  EchoTitle,
  Logo,
  Icon,
  Input,
  Select,
  Checkbox,
  Toast
} = window.ChiaroFilmesDesignSystem_7fe4c8;
const IMG = '../../assets/imagery/';
const BASE = '../../';
const siteStyles = {
  wrap: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 var(--page-margin)'
  },
  overline: {
    font: '800 16px var(--font-display)',
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: 'var(--chiaro-pessego)'
  },
  body: {
    font: '400 17px/1.65 var(--font-body)',
    textWrap: 'pretty',
    margin: 0
  }
};
function Header({
  onNav
}) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const f = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', f);
    return () => window.removeEventListener('scroll', f);
  }, []);
  const links = [['servicos', 'Serviços'], ['espacos', 'Espaços'], ['sobre', 'Quem somos'], ['contato', 'Contato']];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 40,
      background: scrolled ? 'rgba(7,0,16,.82)' : 'transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      borderBottom: '1px solid ' + (scrolled ? 'rgba(255,255,255,.08)' : 'transparent'),
      transition: 'all var(--dur-base) var(--ease-cine)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...siteStyles.wrap,
      height: 76,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#topo",
    onClick: e => {
      e.preventDefault();
      onNav('topo');
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    variant: "filmesHorizontal",
    inverse: true,
    height: 20,
    base: BASE
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      flexWrap: 'wrap'
    }
  }, links.slice(0, 3).map(([id, l]) => /*#__PURE__*/React.createElement("a", {
    key: id,
    href: '#' + id,
    onClick: e => {
      e.preventDefault();
      onNav(id);
    },
    style: {
      color: '#fff',
      font: '500 13px var(--font-display)',
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      textDecoration: 'none'
    }
  }, l)), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: () => onNav('contato')
  }, "Fale com a gente"))));
}
function Hero({
  onNav
}) {
  return /*#__PURE__*/React.createElement("section", {
    id: "topo",
    "data-screen-label": "Hero",
    style: {
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'flex-end',
      color: '#fff',
      background: 'var(--chiaro-noite)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: `url(${IMG}estudio-ar-1.jpg) center/cover`,
      opacity: .75
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg,rgba(7,0,16,.55) 0%,rgba(7,0,16,.15) 40%,rgba(7,0,16,.92) 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      ...siteStyles.wrap,
      position: 'relative',
      width: '100%',
      boxSizing: 'border-box',
      paddingBottom: 96,
      paddingTop: 160
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: siteStyles.overline
  }, "Produtora audiovisual"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '18px 0 0',
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-display-xl)',
      lineHeight: .92,
      textTransform: 'uppercase',
      maxWidth: 1000
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 300
    }
  }, "Sou escuro"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 300
    }
  }, "e sou "), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800,
      color: 'var(--chiaro-lavanda)'
    }
  }, "Chiaro.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 40,
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      marginTop: 36
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      ...siteStyles.body,
      fontSize: 19,
      maxWidth: 520,
      color: '#E4DEF0'
    }
  }, "Da concep\xE7\xE3o \xE0 finaliza\xE7\xE3o, criamos produ\xE7\xF5es que unem excel\xEAncia t\xE9cnica e criatividade \u2014 para que cada hist\xF3ria seja t\xE3o impressionante quanto merece."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "gradient",
    iconRight: "arrow-down",
    onClick: () => onNav('servicos')
  }, "Nossos servi\xE7os"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "light",
    onClick: () => onNav('espacos')
  }, "Conhe\xE7a os est\xFAdios")))));
}
const SERVICOS = [{
  icon: 'clapperboard',
  t: ['Produção', 'externa'],
  img: 'producao-externa.jpg',
  d: 'Nossa equipe se desloca até a locação escolhida para captar conteúdo para vídeos institucionais, publicitários, documentários e mais.'
}, {
  icon: 'stream',
  t: ['Transmissões', 'ao vivo'],
  img: 'transmissoes.jpg',
  d: 'Soluções completas para transmissões em tempo real, com alta qualidade de imagem e som para que seu conteúdo alcance o público.'
}, {
  icon: 'videocamera-record',
  t: ['Gravação em', 'estúdio'],
  img: 'estudio-agua-1.jpg',
  d: 'Cursos on-demand, entrevistas, webinars e videocasts gravados em estúdios equipados com tecnologia de ponta.'
}, {
  icon: 'confetti',
  t: ['Cobertura de', 'eventos'],
  img: 'estudio-mirante-1.jpg',
  d: 'Registramos cada momento com qualidade e precisão — do aftermovie à cobertura completa, gravada ou ao vivo.'
}];
function Servicos() {
  const [hover, setHover] = React.useState(null);
  return /*#__PURE__*/React.createElement("section", {
    id: "servicos",
    "data-screen-label": "Servi\xE7os",
    style: {
      background: 'var(--gradient-noite)',
      color: '#fff',
      padding: '128px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: siteStyles.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 32,
      flexWrap: 'wrap',
      marginBottom: 56
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: siteStyles.overline
  }, "O que fazemos"), /*#__PURE__*/React.createElement(SectionTitle, {
    light: "Nossos",
    bold: "servi\xE7os",
    size: 72,
    color: "#fff",
    style: {
      marginTop: 14
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      ...siteStyles.body,
      maxWidth: 420,
      color: '#B9B1CC'
    }
  }, "Oferecemos solu\xE7\xF5es sob medida, com uma equipe dedicada a cada etapa: roteiro, capta\xE7\xE3o, edi\xE7\xE3o e finaliza\xE7\xE3o.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
      gap: 20
    }
  }, SERVICOS.map((s, i) => /*#__PURE__*/React.createElement("article", {
    key: i,
    onMouseEnter: () => setHover(i),
    onMouseLeave: () => setHover(null),
    style: {
      position: 'relative',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      minHeight: 420,
      background: '#140A26',
      border: '1px solid rgba(255,255,255,.08)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      padding: 28,
      boxSizing: 'border-box',
      transform: hover === i ? 'translateY(-4px)' : 'none',
      boxShadow: hover === i ? 'var(--shadow-glow)' : 'none',
      transition: 'all var(--dur-slow) var(--ease-cine)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: `url(${IMG}${s.img}) center/cover`,
      opacity: hover === i ? .55 : .28,
      transform: hover === i ? 'scale(1.05)' : 'scale(1)',
      transition: 'all var(--dur-scene) var(--ease-out)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg,rgba(20,10,38,.2) 0%,rgba(20,10,38,.95) 75%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 52,
      height: 52,
      borderRadius: 999,
      background: hover === i ? 'var(--chiaro-lavanda)' : 'rgba(140,78,219,.22)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background var(--dur-base) var(--ease-cine)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: s.icon,
    weight: "bold-duotone",
    size: 24
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '22px 0 12px',
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      lineHeight: 1,
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 300
    }
  }, s.t[0], " "), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800
    }
  }, s.t[1])), /*#__PURE__*/React.createElement("p", {
    style: {
      ...siteStyles.body,
      fontSize: 15,
      color: '#CFC8DE'
    }
  }, s.d)))))));
}
Object.assign(window, {
  Header,
  Hero,
  Servicos,
  siteStyles,
  IMG,
  BASE
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/SiteTop.jsx", error: String((e && e.message) || e) }); }

__ds_ns.EchoTitle = __ds_scope.EchoTitle;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.SectionTitle = __ds_scope.SectionTitle;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.MediaCard = __ds_scope.MediaCard;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

})();
