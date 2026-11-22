// 나이트 모드 (어두운 화면) — 페이지 오른쪽 위 🌙/☀ 버튼으로 전환, 이 브라우저에 기억
//  style.css 의 색을 그대로 두고, 나이트 모드일 때만 같은 규칙의 색을 '밝기 뒤집기'(색상은 유지)한 규칙을 자동으로 만들어 덮어씀
//   배경·테두리: 흰색 → 짙은 남색 계열 / 글자: 짙은 색 → 밝은 색 / 빨강·파랑 같은 색 글자는 어두운 바탕에서도 잘 보이게 조금 밝게
//  <head> 에서 style.css 바로 다음에 불러와야 화면이 처음부터 어둡게 나옴 (깜빡임 방지)
(function () {
  const KEY = 'myAsset.theme';
  let dark = false;
  try { dark = localStorage.getItem(KEY) === 'dark'; } catch (e) { /* 무시 */ }

  // ---- 색 계산 ----
  function parse(c) {
    c = c.trim().toLowerCase();
    let m = c.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
    m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    if (c === 'white') return [255, 255, 255, 1];
    if (c === 'black') return [0, 0, 0, 1];
    return null;
  }
  function toHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function fromHsl(h, s, l) {
    if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255));
  }
  // kind: 'bg' (배경·테두리) | 'text' (글자)
  function mapColor(c, kind) {
    const rgb = parse(c);
    if (!rgb) return c;
    const [h, s, l] = toHsl(rgb), a = rgb[3];
    let nl, ns = s;
    if (kind === 'text') {
      nl = 1 - l;
      if (s > 0.25 && nl < 0.66) nl = Math.max(0.66, nl);   // 색 있는 글자 (빨강·파랑·초록 등)
      else if (nl < 0.5) nl = 0.5 + nl * 0.3;                 // 회색 글자
      nl = Math.min(nl, 0.9);
    } else {
      if (s > 0.45 && l > 0.3 && l < 0.65) return c;          // 진한 색 배경 (버튼·태그·막대 등)은 그대로
      nl = 0.12 + (1 - l) * 0.78;
      ns = Math.min(s, 0.55);
    }
    const [r, g, b] = fromHsl(h, ns, nl);
    return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  }
  const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/g;
  const mapValue = (v, kind) => v.replace(COLOR_RE, x => mapColor(x, kind));
  const kindOf = prop => {
    if (prop.startsWith('--')) return /text|muted|pos|neg|primary$|danger/.test(prop) ? 'text' : 'bg';
    if (prop === 'color' || prop === 'caret-color' || prop === '-webkit-text-fill-color') return 'text';
    return 'bg';
  };

  // ---- style.css 규칙을 읽어 나이트 모드 규칙을 만듦 ----
  let built = false;
  function build() {
    if (built) return;
    built = true;
    const out = [];
    const walk = (rules, wrap) => [...rules].forEach(r => {
      if (r.type === 1) { // 일반 규칙
        const decl = [];
        // 진한 색 바탕(파란 버튼·태그 등) 위의 흰 글자는 그대로 흰색
        const bgv = r.style.getPropertyValue('background') || r.style.getPropertyValue('background-color');
        const strongBg = /var\(--primary\)/.test(bgv) || (bgv.match(COLOR_RE) || []).some(x => mapColor(x, 'bg') === x && parse(x));
        COLOR_RE.lastIndex = 0;
        if (/var\(--primary\)/.test(bgv)) decl.push(`background: ${bgv.replace('var(--primary)', '#3560d6')}`);
        for (let i = 0; i < r.style.length; i++) {
          const p = r.style[i], v = r.style.getPropertyValue(p);
          if (strongBg && p === 'color' && parse(v) && toHsl(parse(v))[2] > 0.9) continue;
          if (!v || !COLOR_RE.test(v)) { COLOR_RE.lastIndex = 0; continue; }
          COLOR_RE.lastIndex = 0;
          if (/shadow/.test(p) && !/#(dc2626|d32f2f|c62828)/i.test(v)) { decl.push(`${p}: ${v.replace(/rgba?\([^)]*\)/g, 'rgba(0, 0, 0, .35)')}`); continue; } // 그림자는 검정
          decl.push(`${p}: ${mapValue(v, kindOf(p))}${r.style.getPropertyPriority(p) ? ' !important' : ''}`);
        }
        if (!decl.length) return;
        const sel = r.selectorText.split(',').map(s => {
          s = s.trim();
          if (s === ':root' || s === 'html') return 'html[data-theme="dark"]';
          return 'html[data-theme="dark"] ' + s;
        }).join(', ');
        out.push(wrap(`${sel} { ${decl.join('; ')} }`));
      } else if (r.type === 4) { // @media
        walk(r.cssRules, x => wrap(`@media ${r.conditionText || r.media.mediaText} { ${x} }`));
      } else if (r.type === 7) { // @keyframes 는 그대로 (색이 들어간 애니메이션은 거의 없음)
      }
    });
    [...document.styleSheets].forEach(sh => {
      if (!sh.href || !/style\.css/.test(sh.href)) return;
      try { walk(sh.cssRules, x => x); } catch (e) { console.warn('나이트 모드: 스타일을 읽지 못했습니다', e); }
    });
    out.push('html[data-theme="dark"] { color-scheme: dark; }');
    out.push('html[data-theme="dark"] img { filter: brightness(.9); }');
    const st = document.createElement('style');
    st.id = 'theme-dark';
    st.textContent = out.join('\n');
    document.head.appendChild(st);
  }

  function apply() {
    if (dark) build();
    document.documentElement.toggleAttribute('data-theme', false);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  }
  apply();

  // 차트(Chart.js)는 캔버스에 그려서 CSS가 안 먹음 → 그릴 때 글자·격자·흰 점 색을 바꿔 줌 (render.js UI.chart 에서 호출)
  function chartConfig(config) {
    if (!window.Chart) return config;
    Chart.defaults.color = dark ? '#a3acbd' : '#6b7486';
    Chart.defaults.borderColor = dark ? 'rgba(255, 255, 255, .1)' : 'rgba(0, 0, 0, .1)';
    Chart.defaults.elements.arc.borderColor = dark ? '#1b2130' : '#fff';
    if (!dark) return config;
    const fix = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 6) return;
      Object.keys(o).forEach(k => {
        const v = o[k];
        if (typeof v === 'string' && /color$/i.test(k) && parse(v)) {
          const p = parse(v), [h, s, l] = toHsl(p);
          if (l > 0.85 || (s < 0.15 && l > 0.6)) o[k] = mapColor(v, 'bg'); // 흰색·연회색(격자·점 바탕)은 어둡게
          else if (s > 0.4 && l < 0.5) { const [r, g, b] = fromHsl(h, s, 0.62); o[k] = p[3] < 1 ? `rgba(${r}, ${g}, ${b}, ${p[3]})` : `rgb(${r}, ${g}, ${b})`; } // 진한 선(파랑 등)은 밝게
        } else if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'data') fix(v, depth + 1);
      });
    };
    fix(config.options, 0);
    (config.data && config.data.datasets || []).forEach(ds => fix(ds, 0));
    return config;
  }

  window.Theme = {
    isDark: () => dark,
    // 캔버스에 직접 그리는 색 (예: 글자 테두리 흰색 → 나이트 모드에서는 패널 색)
    c: (color, kind = 'bg') => (dark ? mapColor(color, kind) : color),
    chartConfig,
    toggle() {
      dark = !dark;
      try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (e) { /* 무시 */ }
      apply();
      return dark;
    }
  };
})();
