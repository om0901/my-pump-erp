import React, { useState } from 'react';
import {
  Calculator,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  Edit2,
  RotateCcw,
  Layers
} from 'lucide-react';
import NumericInput from './NumericInput';

export default function CashDenominationModal({
  isOpen,
  onClose,
  onApply,
  showToast
}) {
  const [cashCounters, setCashCounters] = useState([
    { id: '1', title: 'Counter 1', notes: { n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, n5: 0, coins: 0 } },
    { id: '2', title: 'Counter 2', notes: { n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, n5: 0, coins: 0 } },
  ]);

  const [activeCounterId, setActiveCounterId] = useState('1');
  const [editingTitleId, setEditingTitleId] = useState(null);

  if (!isOpen) return null;

  const activeCounter = cashCounters.find(c => c.id === activeCounterId) || cashCounters[0];

  const getCounterTotal = (counter) => {
    if (!counter || !counter.notes) return 0;
    const n = counter.notes;
    return (
      (parseFloat(n.n500) || 0) * 500 +
      (parseFloat(n.n200) || 0) * 200 +
      (parseFloat(n.n100) || 0) * 100 +
      (parseFloat(n.n50) || 0) * 50 +
      (parseFloat(n.n20) || 0) * 20 +
      (parseFloat(n.n10) || 0) * 10 +
      (parseFloat(n.n5) || 0) * 5 +
      (parseFloat(n.coins) || 0) * 1
    );
  };

  const grandTotalCash = cashCounters.reduce((acc, c) => acc + getCounterTotal(c), 0);
  const activeCounterTotal = getCounterTotal(activeCounter);

  const handleAddCounter = () => {
    const nextNum = cashCounters.length + 1;
    const newId = `counter_${Date.now()}`;
    const newCounter = {
      id: newId,
      title: `Counter ${nextNum}`,
      notes: { n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, n5: 0, coins: 0 }
    };
    setCashCounters([...cashCounters, newCounter]);
    setActiveCounterId(newId);
    if (showToast) showToast(`Added new cash counter tab: ${newCounter.title}`, 'info');
  };

  const handleDeleteCounter = (id, e) => {
    e.stopPropagation();
    if (cashCounters.length <= 1) {
      if (showToast) showToast('At least one counter tab must remain', 'warning');
      return;
    }
    const updated = cashCounters.filter(c => c.id !== id);
    setCashCounters(updated);
    if (activeCounterId === id) {
      setActiveCounterId(updated[0].id);
    }
  };

  const handleNoteChange = (key, value) => {
    const num = value === '' ? '' : (parseInt(value, 10) || 0);
    setCashCounters(prev => prev.map(c => {
      if (c.id === activeCounterId) {
        return {
          ...c,
          notes: {
            ...c.notes,
            [key]: num
          }
        };
      }
      return c;
    }));
  };

  const handleTitleChange = (id, newTitle) => {
    setCashCounters(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, title: newTitle || 'Counter' };
      }
      return c;
    }));
  };

  const handleResetActive = () => {
    setCashCounters(prev => prev.map(c => {
      if (c.id === activeCounterId) {
        return {
          ...c,
          notes: { n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, n5: 0, coins: 0 }
        };
      }
      return c;
    }));
  };

  const handleResetAll = () => {
    setCashCounters(prev => prev.map(c => ({
      ...c,
      notes: { n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, n5: 0, coins: 0 }
    })));
    if (showToast) showToast('Reset all cash counter tabs', 'info');
  };

  const handleApplyToShift = () => {
    // Sum note counts across ALL counter tabs for main shift settlement
    const aggregatedNotes = {
      n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, n5: 0, coins: 0
    };

    cashCounters.forEach(c => {
      const n = c.notes || {};
      aggregatedNotes.n500 += parseFloat(n.n500) || 0;
      aggregatedNotes.n200 += parseFloat(n.n200) || 0;
      aggregatedNotes.n100 += parseFloat(n.n100) || 0;
      aggregatedNotes.n50 += parseFloat(n.n50) || 0;
      aggregatedNotes.n20 += parseFloat(n.n20) || 0;
      aggregatedNotes.n10 += parseFloat(n.n10) || 0;
      aggregatedNotes.n5 += parseFloat(n.n5) || 0;
      aggregatedNotes.coins += parseFloat(n.coins) || 0;
    });

    if (onApply) {
      onApply(aggregatedNotes, grandTotalCash);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn font-sans select-text">
      <div className="bg-[#121927] border border-[#1e293b] rounded-2xl p-5 w-full max-w-2xl space-y-3.5 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#172033] border border-[#23304a] text-emerald-400 flex items-center justify-center">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
                💵 Multi-Counter Cash Calculator (Kupan)
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Count multiple cashier boxes with dynamic aggregation
              </p>
            </div>
          </div>
          <button type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#172033] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Counter Tabs Toolbar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 select-none">
          {cashCounters.map((counter) => {
            const isActive = counter.id === activeCounterId;
            const cTotal = getCounterTotal(counter);
            const isEditing = editingTitleId === counter.id;

            return (
              <div
                key={counter.id}
                onClick={() => setActiveCounterId(counter.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all duration-150 whitespace-nowrap ${
                  isActive
                    ? 'bg-[#192438] text-white font-semibold border-l-2 border-blue-500 border-t border-r border-b border-[#23304a] shadow-sm'
                    : 'bg-[#0e1420] hover:bg-[#172033] text-slate-400 border border-[#1b2537]'
                }`}
              >
                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    value={counter.title}
                    onChange={(e) => handleTitleChange(counter.id, e.target.value)}
                    onBlur={() => setEditingTitleId(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingTitleId(null)}
                    className="bg-[#172033] text-slate-100 px-1.5 py-0.5 rounded text-xs font-semibold outline-none w-24 border border-[#23304a]"
                  />
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span>{counter.title}</span>
                    <button type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTitleId(counter.id);
                      }}
                      className={`p-0.5 rounded hover:bg-slate-700/40 ${isActive ? 'text-blue-300' : 'text-slate-500'}`}
                      title="Rename Tab"
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}

                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-[#172033] text-emerald-400 font-bold' : 'bg-[#121927] text-slate-400'
                }`}>
                  ₹{cTotal.toLocaleString('en-IN')}
                </span>

                {cashCounters.length > 1 && (
                  <button type="button"
                    onClick={(e) => handleDeleteCounter(counter.id, e)}
                    className={`p-0.5 rounded hover:bg-rose-900/60 hover:text-white ${isActive ? 'text-blue-300' : 'text-slate-500'}`}
                    title="Delete Counter Tab"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}

          <button type="button"
            onClick={handleAddCounter}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#172033] hover:bg-[#1f2b45] text-blue-400 border border-blue-500/40 transition-all active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>+ Counter</span>
          </button>
        </div>

        {/* Active Tab Denomination Grid */}
        <div className="bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" /> {activeCounter?.title} Denomination Counting
            </span>
            <span className="text-xs font-mono font-semibold text-blue-400">
              Subtotal: <strong>₹{activeCounterTotal.toLocaleString('en-IN')}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
            {[
              { label: '₹500 Note', key: 'n500', val: 500, pill: 'text-amber-400' },
              { label: '₹200 Note', key: 'n200', val: 200, pill: 'text-orange-400' },
              { label: '₹100 Note', key: 'n100', val: 100, pill: 'text-blue-400' },
              { label: '₹50 Note', key: 'n50', val: 50, pill: 'text-cyan-400' },
              { label: '₹20 Note', key: 'n20', val: 20, pill: 'text-emerald-400' },
              { label: '₹10 Note', key: 'n10', val: 10, pill: 'text-slate-300' },
              { label: 'Coin 5 (₹5)', key: 'n5', val: 5, pill: 'text-teal-400' },
              { label: 'Coins / Loose Mix', key: 'coins', val: 1, pill: 'text-slate-400' },
            ].map((row) => {
              const count = parseFloat(activeCounter?.notes?.[row.key]) || 0;
              const rowTotal = count * row.val;

              return (
                <div key={row.key} className="p-1.5 rounded-lg bg-[#121927] border border-[#1e293b] flex items-center justify-between gap-2 text-xs">
                  <span className={`font-semibold ${row.pill} min-w-[85px] text-[11px]`}>{row.label}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 font-mono text-[11px]">×</span>
                    <NumericInput
                      placeholder="0"
                      value={activeCounter?.notes?.[row.key] || ''}
                      onChange={(v) => handleNoteChange(row.key, v)}
                      className="w-16 bg-[#172033] border border-[#23304a] focus:border-blue-500 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-100 outline-none tabular-nums"
                    />
                  </div>
                  <span className="w-20 text-right font-mono font-semibold text-xs text-slate-100 tabular-nums">
                    ₹{rowTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 text-[11px]">{activeCounter?.title} Subtotal:</span>
            <span className="font-mono text-xs font-bold text-blue-400 tabular-nums">
              ₹ {activeCounterTotal.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Modal Footer Summary & Grand Total */}
        <div className="pt-2 border-t border-slate-800 space-y-2.5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-[#0f1726] border border-[#1e293b] p-3 rounded-xl font-mono">
            <div>
              <div className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
                Grand Total Physical Cash ({cashCounters.length} Counters):
              </div>
              <div className="text-[10px] text-emerald-400 font-medium">
                Live calculated aggregate across tabs
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
              ₹ {grandTotalCash.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleResetActive}
                className="px-2.5 py-1.5 rounded-lg bg-[#172033] hover:bg-[#1f2b45] border border-[#23304a] text-slate-300 font-semibold text-xs transition-all active:scale-95 cursor-pointer"
              >
                Reset Tab
              </button>

              <button
                type="button"
                onClick={handleResetAll}
                className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-400 font-semibold text-xs transition-all active:scale-95 cursor-pointer"
              >
                Reset All
              </button>
            </div>

            <button
              type="button"
              onClick={handleApplyToShift}
              className="px-4 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold text-xs shadow-md shadow-blue-900/30 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Apply to Shift Cash</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
