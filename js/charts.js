// 차트 공통 (Chart.js CDN)
window.Charts = (function () {
  if (window.Chart) {
    Chart.defaults.font.family = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
    Chart.defaults.color = '#6b7486';
  }

  // 스냅샷 목록 → 통화 모드별 시계열. 과거 USD·혼합 모드는 items 에서 재계산합니다 (16·21항).
  async function snapshotSeries(snaps, mode) {
    const labels = snaps.map(s => s.snapshot_date);
    if (mode === 'KRW') {
      return { labels, series: [
        { label: '평가금액', cur: 'KRW', data: snaps.map(s => s.total_value_krw) },
        { label: '투자금액', cur: 'KRW', data: snaps.map(s => s.total_invested_krw), dashed: true }
      ] };
    }
    const models = await Promise.all(snaps.map(async s => Calc.buildSnapshotModel(await DataService.getSnapshotItems(s.id))));
    if (mode === 'USD') {
      return { labels, series: [
        { label: '평가금액', cur: 'USD', data: models.map(m => (m.fx ? m.total.valK / m.fx : 0)) },
        { label: '투자금액', cur: 'USD', data: models.map(m => (m.fx ? m.total.invK / m.fx : 0)), dashed: true }
      ] };
    }
    if (mode === 'GOLD') { // 금환산: 날짜마다 그날 금 1g 가격으로 나눈 금 무게(g)
      const golds = await Promise.all(snaps.map((s, i) => DataService.goldKrwPerGramOn(s.snapshot_date, models[i].fx)));
      return { labels, series: [
        { label: '평가금액 (금 g)', cur: 'XAU', data: models.map((m, i) => (golds[i] ? m.total.valK / golds[i] : null)) },
        { label: '투자금액 (금 g)', cur: 'XAU', data: models.map((m, i) => (golds[i] ? m.total.invK / golds[i] : null)), dashed: true }
      ] };
    }
    return { labels, series: [
      { label: '한국자산 평가 (₩)', cur: 'KRW', data: models.map(m => m.total.kr.val) },
      { label: '한국자산 투자 (₩)', cur: 'KRW', data: models.map(m => m.total.kr.inv), dashed: true },
      { label: '미국자산 평가 ($)', cur: 'USD', data: models.map(m => m.total.us.val), axis: 'y1' },
      { label: '미국자산 투자 ($)', cur: 'USD', data: models.map(m => m.total.us.inv), axis: 'y1', dashed: true }
    ] };
  }

  const tick = cur => v => {
    if (cur === 'USD') return '$' + Fmt.plain(v);
    if (cur === 'XAU') return Fmt.plain(v) + 'g';
    return Math.abs(v) >= 1e8 ? '₩' + Fmt.plain(v / 1e8, 2) + '억' : Math.abs(v) >= 1e4 ? '₩' + Fmt.plain(v / 1e4) + '만' : '₩' + Fmt.plain(v);
  };
  const palette = ['#2453d6', '#8fa6e8', '#17a589', '#8fd1c4'];

  function trend(canvasId, { labels, series }) {
    const hasY1 = series.some(s => s.axis === 'y1');
    const y0cur = (series.find(s => s.axis !== 'y1') || {}).cur || 'KRW';
    return UI.chart(canvasId, {
      type: 'line',
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.label, data: s.data, yAxisID: s.axis || 'y',
          borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length],
          borderWidth: s.dashed ? 1.5 : 2, borderDash: s.dashed ? [5, 4] : [], pointRadius: 0, tension: 0.15
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, boxHeight: 2 } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Fmt.money(c.parsed.y, series[c.datasetIndex].cur)}` } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, callback: function (v) { return Fmt.md(this.getLabelForValue(v)); } }, grid: { display: false } },
          y: { ticks: { callback: tick(y0cur) }, grid: { color: '#eef1f5' } },
          ...(hasY1 ? { y1: { position: 'right', ticks: { callback: tick('USD') }, grid: { display: false } } } : {})
        }
      }
    });
  }

  // 자산군 비중 도넛: 조각 안에 '이름 + 비중' 표시. 조각이 작으면 글자를 생략하고 마우스를 올리면 전체가 보입니다.
  function doughnut(canvasId, labels, values, colors) {
    const total = values.reduce((a, b) => a + b, 0);
    const share = v => (total ? (v / total) * 100 : 0);
    const sliceLabels = {
      id: 'sliceLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.getDatasetMeta(0).data.forEach((arc, i) => {
          const p = share(values[i]);
          if (p < 5) return; // 작은 조각은 툴팁으로만
          const { x, y } = arc.tooltipPosition();
          ctx.save();
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,.35)';
          ctx.shadowBlur = 3;
          ctx.font = '600 12px "Pretendard","Malgun Gothic",sans-serif';
          ctx.fillText(labels[i], x, y - 7);
          ctx.font = '500 11.5px "Pretendard","Malgun Gothic",sans-serif';
          ctx.fillText(Fmt.weight(p), x, y + 8);
          ctx.restore();
        });
      }
    };
    return UI.chart(canvasId, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 1, borderColor: '#fff' }] },
      plugins: [sliceLabels],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, cutout: '45%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              generateLabels: chart => Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart)
                .map(l => ({ ...l, text: `${labels[l.index]}  ${Fmt.weight(share(values[l.index]))}` }))
            }
          },
          tooltip: { callbacks: { label: c => ` ${c.label}: ${Fmt.weight(share(c.parsed))} (${Fmt.krw(c.parsed)})` } }
        }
      }
    });
  }

  // 자산군 비중 추이 (당시 분류). 원화환산 = ₩ 누적, 달러환산 = 당시 환율로 나눈 $ 누적.
  // part (혼합 모드): 'kr' = 원화 자산(₩)만, 'us' = 달러 자산($)만 따로 그립니다. 툴팁 비중은 그 차트 안에서의 비중.
  function groupShare(canvasId, snaps, models, mode, part) {
    const labels = snaps.map(s => s.snapshot_date);
    const cur = part === 'us' || (!part && mode === 'USD') ? 'USD' : !part && mode === 'GOLD' ? 'XAU' : 'KRW';
    const valueOf = (m, code) => {
      const a = m.groups[code].agg;
      if (part === 'kr') return a.kr.val;
      if (part === 'us') return a.us.val;
      if (cur === 'XAU') return m.gold ? a.valK / m.gold : 0; // 금환산: 그날 금 1g 가격으로 나눈 g
      return cur === 'USD' ? (m.fx ? a.valK / m.fx : 0) : a.valK;
    };
    const shareOf = (i, code) => {
      const tot = Groups.codes.reduce((s, c) => s + valueOf(models[i], c), 0);
      return tot ? (valueOf(models[i], code) / tot) * 100 : 0;
    };
    return UI.chart(canvasId, {
      type: 'line',
      data: {
        labels,
        datasets: Groups.list.map(g => ({
          label: g.name, code: g.code, fill: true, pointRadius: 0, borderWidth: 1, tension: 0.1,
          borderColor: g.color, backgroundColor: g.color + 'b3',
          data: models.map(m => valueOf(m, g.code))
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12 } },
          tooltip: { callbacks: { label: c => {
            const w = Fmt.weight(shareOf(c.dataIndex, c.dataset.code));
            return ` ${c.dataset.label}: ${Fmt.money(c.parsed.y, cur)} (${w})`;
          } } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, callback: function (v) { return Fmt.md(this.getLabelForValue(v)); } }, grid: { display: false } },
          y: { stacked: true, min: 0, ticks: { callback: tick(cur) }, grid: { color: '#eef1f5' } }
        }
      }
    });
  }

  return { snapshotSeries, trend, doughnut, groupShare };
})();
