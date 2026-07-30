"use client";

import { useEffect, useState, useCallback } from "react";
import { PageFrame } from "@/components/page-frame";
import { Plus, X, RefreshCcw, Save, Calculator, Settings, CheckSquare, AlertTriangle, Users, UserCheck } from "lucide-react";
import { useAppSession } from "@/lib/client/session";

// Utilities
const money = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const whole = new Intl.NumberFormat("en-US");

interface PrItem {
  pr_id: string;
  name: string;
  rate_cents: number;
}

interface PrLine {
  pr_id?: string;
  name: string;
  attendees: number;
  rate_cents: number;
  amount_cents?: number;
  payout_cents?: number;
}

interface ActualsData {
  eligible_attendees: number;
  pr_attendees: number;
  direct_attendees: number;
  non_revenue_attendees: number;
  venue_payment_cents: number;
  total_pr_commission_cents: number;
  retained_cents: number;
  pr_lines: PrLine[];
  booked_pr_guests?: number;
  booked_direct_guests?: number;
  booked_total_guests?: number;
}

export default function CalculatorPage() {
  useAppSession();
  const [activeTab, setActiveTab] = useState<"setup" | "actuals" | "projection">("setup");
  
  // Setup State
  const [prs, setPrs] = useState<PrItem[]>([]);
  const [batchRows, setBatchRows] = useState<{name: string, rateCents: number}[]>([{ name: "", rateCents: 0 }]);
  const [savingBatch, setSavingBatch] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  
  // Actuals State
  const [actuals, setActuals] = useState<ActualsData | null>(null);
  const [loadingActuals, setLoadingActuals] = useState(false);

  // Projections State
  const [projGuests, setProjGuests] = useState(200);
  const [projPrPercent, setProjPrPercent] = useState(80);
  const [projPrRate, setProjPrRate] = useState(2.5);
  const [projVenueRate, setProjVenueRate] = useState(6.0);
  const [projFixedCosts, setProjFixedCosts] = useState(500);

  const fetchSetup = useCallback(async () => {
    const res = await fetch("/api/calculator/setup");
    if (res.ok) {
      const data = await res.json();
      setPrs(data.prs || []);
    }
  }, []);

  const fetchActuals = useCallback(async () => {
    setLoadingActuals(true);
    const res = await fetch("/api/calculator/actuals");
    if (res.ok) {
      setActuals(await res.json());
    }
    setLoadingActuals(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSetup();
    void fetchActuals();
  }, [fetchSetup, fetchActuals]);

  // --- Handlers for Setup ---
  const saveBatch = async () => {
    const rows = batchRows.filter(r => r.name.trim());
    if (!rows.length) return alert("Enter a name for every PR row.");
    setSavingBatch(true);
    const res = await fetch("/api/calculator/prs/batch", {
      method: "POST",
      body: JSON.stringify({ rows })
    });
    if (res.ok) {
      setBatchRows([{ name: "", rateCents: 0 }]);
      fetchSetup();
    } else {
      alert("Error saving batch");
    }
    setSavingBatch(false);
  };

  const saveRates = async () => {
    setSavingRates(true);
    const rates = prs.map(pr => ({
      prId: pr.pr_id,
      name: pr.name,
      rateCents: pr.rate_cents
    }));
    const res = await fetch("/api/calculator/rates", {
      method: "PATCH",
      body: JSON.stringify({ rates })
    });
    if (res.ok) {
      fetchSetup();
    } else {
      alert("Error saving rates");
    }
    setSavingRates(false);
  };

  const removePr = async (prId: string) => {
    if (!confirm("Are you sure you want to remove this PR?")) return;
    // Since Next.js has an existing PR PATCH for active toggle:
    const res = await fetch("/api/prs", {
      method: "PATCH",
      body: JSON.stringify({ prId, active: false })
    });
    if (res.ok) fetchSetup();
  };

  // --- Render Tabs ---
  return (
    <PageFrame>
      <main className="safe-bottom mx-auto max-w-4xl px-4 py-7">
        <div className="mb-7">
          <p className="eyebrow mb-2">Cost & Payouts</p>
          <h1 className="text-3xl font-black tracking-[-0.04em]">Calculator</h1>
        </div>

        {/* Custom Tabs Navigation mimicking the original CSS structure */}
        <nav className="flex gap-2 mb-8 border-b border-[var(--line)] pb-2 overflow-x-auto">
          <button 
            onClick={() => setActiveTab("setup")}
            className={`px-4 py-2 font-bold whitespace-nowrap rounded-lg ${activeTab === "setup" ? "bg-white text-black" : "text-[var(--muted)] hover:text-white"}`}
          >
            <Settings size={18} className="inline mr-2 -mt-1" />
            PR Setup
          </button>
          <button 
            onClick={() => { setActiveTab("actuals"); if (!actuals) fetchActuals(); }}
            className={`px-4 py-2 font-bold whitespace-nowrap rounded-lg ${activeTab === "actuals" ? "bg-white text-black" : "text-[var(--muted)] hover:text-white"}`}
          >
            <CheckSquare size={18} className="inline mr-2 -mt-1" />
            Actuals
          </button>
          <button 
            onClick={() => setActiveTab("projection")}
            className={`px-4 py-2 font-bold whitespace-nowrap rounded-lg ${activeTab === "projection" ? "bg-white text-black" : "text-[var(--muted)] hover:text-white"}`}
          >
            <Calculator size={18} className="inline mr-2 -mt-1" />
            Projections
          </button>
        </nav>

        {/* Tab Content: Setup */}
        {activeTab === "setup" && (
          <div className="space-y-8 animate-in fade-in">
            <section className="py-2">
              <h2 className="text-xl font-bold mb-1">Batch add PRs</h2>
              <p className="text-sm text-[var(--muted)] mb-4">Quickly add multiple PRs and set their default rates.</p>
              
              <div className="space-y-2 mb-4">
                {batchRows.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <div className="flex-1">
                      <input 
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-[var(--accent)]" 
                        placeholder="PR Name"
                        value={row.name}
                        onChange={(e) => {
                          const newRows = [...batchRows];
                          newRows[idx].name = e.target.value;
                          setBatchRows(newRows);
                        }}
                      />
                    </div>
                    <div className="w-24 shrink-0">
                      <input 
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-[var(--accent)]" 
                        type="number" min="0" step="0.25"
                        value={row.rateCents ? row.rateCents / 100 : ""}
                        onChange={(e) => {
                          const newRows = [...batchRows];
                          newRows[idx].rateCents = Math.max(0, Math.round(Number(e.target.value) * 100));
                          setBatchRows(newRows);
                        }}
                      />
                    </div>
                    <button 
                      onClick={() => setBatchRows(batchRows.filter((_, i) => i !== idx))}
                      className="p-2 text-[var(--muted)] hover:text-red-400 shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between items-center pt-1">
                <button 
                  onClick={() => setBatchRows([...batchRows, {name:"", rateCents: 0}])}
                  className="text-xs font-bold flex items-center text-[var(--accent)] hover:underline"
                >
                  <Plus size={14} className="mr-1" /> Add PR row
                </button>
                {batchRows.length > 0 && (
                  <button 
                    onClick={saveBatch} disabled={savingBatch}
                    className="bg-[var(--accent)] text-black font-bold px-4 py-2 text-sm rounded-lg disabled:opacity-50 flex items-center"
                  >
                    <Save size={14} className="mr-1.5" />
                    {savingBatch ? "Saving..." : "Save batch"}
                  </button>
                )}
              </div>
            </section>

            <div className="h-px bg-white/10 my-4" />

            <section className="py-2">
              <h2 className="text-xl font-bold mb-1">Active PR Rates</h2>
              <p className="text-sm text-[var(--muted)] mb-4">Edit commission rates or update PR names directly.</p>
              
              {prs.length === 0 ? (
                <div className="text-center py-4 text-[var(--muted)] font-medium text-sm">No PRs yet. Batch add them above.</div>
              ) : (
                <>
                  <div className="space-y-2 mb-4">
                    {prs.map((pr, idx) => (
                      <div key={pr.pr_id} className="flex gap-2 items-center">
                        <div className="flex-1">
                          <input 
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-[var(--accent)]" 
                            value={pr.name}
                            onChange={(e) => {
                              const newPrs = [...prs];
                              newPrs[idx].name = e.target.value;
                              setPrs(newPrs);
                            }}
                          />
                        </div>
                        <div className="w-24 shrink-0">
                          <input 
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-[var(--accent)]" 
                            type="number" min="0" step="0.25"
                            value={pr.rate_cents / 100}
                            onChange={(e) => {
                              const newPrs = [...prs];
                              newPrs[idx].rate_cents = Math.max(0, Math.round(Number(e.target.value) * 100));
                              setPrs(newPrs);
                            }}
                          />
                        </div>
                        <button 
                          onClick={() => removePr(pr.pr_id)}
                          className="p-2 text-[var(--muted)] hover:text-red-400 shrink-0"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button 
                      onClick={saveRates} disabled={savingRates}
                      className="bg-white text-black font-bold px-5 py-2 text-sm rounded-lg disabled:opacity-50 flex items-center"
                    >
                      <Save size={16} className="mr-1.5" />
                      {savingRates ? "Saving..." : "Save all rates"}
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* Tab Content: Actuals */}
        {activeTab === "actuals" && (
          <div className="space-y-6 animate-in fade-in py-2">
            <section>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-bold mb-0.5">Actual attendance</h2>
                  <p className="text-sm text-[var(--muted)]">Live numbers imported from check-ins.</p>
                </div>
                <button onClick={fetchActuals} disabled={loadingActuals} className="p-2 rounded-lg text-[var(--muted)] hover:text-white disabled:opacity-50">
                  <RefreshCcw size={18} className={loadingActuals ? "animate-spin" : ""} />
                </button>
              </div>

              {loadingActuals && !actuals ? (
                <div className="text-center py-6 text-[var(--muted)] font-medium text-sm">Loading actual numbers...</div>
              ) : actuals ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard label="Eligible checked in" value={whole.format(actuals.eligible_attendees || 0)} />
                  <MetricCard label="PR checked in" value={whole.format(actuals.pr_attendees || 0)} />
                  <MetricCard label="Direct checked in" value={whole.format(actuals.direct_attendees || 0)} />
                  <MetricCard label="Venue payment" value={money(actuals.venue_payment_cents)} />
                  <MetricCard label="Total owed to PRs" value={money(actuals.total_pr_commission_cents)} />
                  <MetricCard 
                    label="Amount retained" 
                    value={money(actuals.retained_cents)} 
                    highlight={actuals.retained_cents >= 0 ? "positive" : "negative"} 
                  />
                </div>
              ) : null}
            </section>

            {(actuals?.pr_lines?.length ?? 0) > 0 && (
              <section className="pt-4 border-t border-white/10">
                <h2 className="text-lg font-bold mb-3">Every PR Breakdown</h2>
                <div className="space-y-2">
                  {actuals?.pr_lines?.map((line: PrLine, idx: number) => (
                    <div key={line.pr_id || line.name || idx} className="flex justify-between items-center py-2 px-3 bg-white/5 rounded-lg border border-white/5">
                      <div>
                        <div className="font-bold text-sm">{line.name}</div>
                        <div className="text-xs text-[var(--muted)]">{line.attendees} check-ins × {money(line.rate_cents)}</div>
                      </div>
                      <div className="text-base font-black">{money(line.amount_cents ?? line.payout_cents ?? 0)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Tab Content: Projections */}
        {activeTab === "projection" && (
          <div className="animate-in fade-in pt-2 pb-[300px]">
            <section>
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-1">Projections & Break-even</h2>
                <p className="text-sm text-[var(--muted)]">Estimate your event&apos;s profitability.</p>
              </div>

              {/* Current Active Bookings Summary Widget */}
              <div className="mb-8 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users size={18} className="text-[var(--accent)]" />
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                      Already Booked Reservations
                    </span>
                  </div>
                  <span className="text-xs font-bold bg-[var(--panel-raised)] text-[var(--ink)] px-3 py-1 rounded-full border border-white/10">
                    {actuals ? whole.format(actuals.booked_total_guests ?? 0) : "..."} Total Booked
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                    <div className="flex items-center gap-1.5 mb-1 text-amber-400 font-bold text-xs">
                      <UserCheck size={14} />
                      <span>Booked via PR</span>
                    </div>
                    <p className="text-2xl font-black text-white">
                      {actuals ? whole.format(actuals.booked_pr_guests ?? 0) : "—"}
                      <span className="text-xs font-normal text-[var(--muted)] ml-1.5">guests</span>
                    </p>
                  </div>

                  <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                    <div className="flex items-center gap-1.5 mb-1 text-sky-400 font-bold text-xs">
                      <Users size={14} />
                      <span>Booked Direct (Self)</span>
                    </div>
                    <p className="text-2xl font-black text-white">
                      {actuals ? whole.format(actuals.booked_direct_guests ?? 0) : "—"}
                      <span className="text-xs font-normal text-[var(--muted)] ml-1.5">guests</span>
                    </p>
                  </div>
                </div>

                {actuals && (actuals.booked_total_guests ?? 0) > 0 && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const total = actuals.booked_total_guests ?? 0;
                        const pr = actuals.booked_pr_guests ?? 0;
                        if (total > 0) {
                          setProjGuests(total);
                          setProjPrPercent(Math.round((pr / total) * 100));
                        }
                      }}
                      className="text-xs font-bold text-[var(--accent)] hover:underline cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCcw size={12} /> Sync Projections to Bookings ({whole.format(actuals.booked_total_guests ?? 0)} guests)
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="space-y-4">
                  <Slider 
                    label="Expected Guests" value={projGuests} min={0} max={1000} step={10} 
                    displayValue={whole.format(projGuests)} onChange={setProjGuests} 
                  />
                  <Slider 
                    label="PR Guests (%)" value={projPrPercent} min={0} max={100} step={1} 
                    displayValue={`${projPrPercent}%`} onChange={setProjPrPercent} 
                  />
                  <Slider 
                    label="PR Commission Rate" value={projPrRate} min={0} max={10} step={0.25} 
                    displayValue={money(projPrRate * 100)} onChange={setProjPrRate} 
                  />
                  <Slider 
                    label="Venue Payout / Guest" value={projVenueRate} min={0} max={10} step={0.25} 
                    displayValue={money(projVenueRate * 100)} onChange={setProjVenueRate} 
                  />
                  <Slider 
                    label="Fixed Event Costs" value={projFixedCosts} min={0} max={3000} step={50} 
                    displayValue={money(projFixedCosts * 100)} onChange={setProjFixedCosts} 
                  />
                </div>

                {(() => {
                  const prGuests = Math.round(projGuests * (projPrPercent / 100));
                  const directGuests = projGuests - prGuests;
                  const prTotal = prGuests * projPrRate;
                  const venueTotal = projGuests * projVenueRate;
                  const net = venueTotal - prTotal - projFixedCosts;

                  const netMarginPerGuest = projVenueRate - (projPrPercent / 100) * projPrRate;
                  const additionalGuestsNeeded = netMarginPerGuest > 0 && net < 0
                    ? Math.ceil(Math.abs(net) / netMarginPerGuest)
                    : 0;
                  const breakEvenGuestsTotal = projGuests + additionalGuestsNeeded;

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <MetricCard label="PR Guests" value={whole.format(prGuests)} />
                        <MetricCard label="Direct Guests" value={whole.format(directGuests)} />
                      </div>
                      
                      <div className="space-y-2 pt-2">
                        <SummaryRow label="Venue Payout" value={venueTotal} tooltip={`${whole.format(projGuests)} Total Guests × €${projVenueRate.toFixed(2)}`} />
                        <SummaryRow label="PR Payouts" value={prTotal} tooltip={`${whole.format(prGuests)} PR Guests × €${projPrRate.toFixed(2)}`} />
                        <SummaryRow label="Fixed Costs" value={projFixedCosts} tooltip="Flat fee entered above" />
                        <div className={`flex justify-between items-center pt-3 border-t border-white/10 text-lg font-black ${net < 0 ? "text-red-400" : "text-emerald-400"}`}>
                          <div className="flex items-center gap-1.5">
                            Net Profit
                            <InfoTooltip tooltip={`${money(venueTotal * 100)} - ${money(prTotal * 100)} - ${money(projFixedCosts * 100)}`} />
                          </div>
                          <span>{money(net * 100)}</span>
                        </div>

                        {net < 0 && (
                          <div className="mt-3.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200 animate-in fade-in slide-in-from-top-1">
                            <div className="flex items-center gap-1.5 text-red-400 font-extrabold text-sm mb-1">
                              <AlertTriangle size={16} />
                              <span>Break-Even Target</span>
                            </div>
                            {netMarginPerGuest > 0 ? (
                              <p className="leading-relaxed font-medium">
                                You need <span className="font-black text-white text-sm underline underline-offset-2">{whole.format(additionalGuestsNeeded)} more guests</span> ({whole.format(breakEvenGuestsTotal)} total) to reach break-even.
                              </p>
                            ) : (
                              <p className="leading-relaxed font-medium">
                                Unable to break even with current rates: PR payout per guest exceeds Venue payout.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </section>
          </div>
        )}
      </main>
    </PageFrame>
  );
}

// Reusable Components
function MetricCard({ label, value, highlight }: { label: string, value: string, highlight?: "positive" | "negative" }) {
  return (
    <div className={`p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] ${highlight === "positive" ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" : highlight === "negative" ? "border-red-500/50 text-red-400 bg-red-500/10" : ""}`}>
      <dt className="text-xs font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">{label}</dt>
      <dd className="text-2xl font-black">{value}</dd>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (val: number) => void;
}

function Slider({ label, value, min, max, step, displayValue, onChange }: SliderProps) {
  return (
    <label className="block">
      <div className="flex justify-between mb-2">
        <span className="text-sm font-bold text-[var(--muted)]">{label}</span>
        <span className="font-black">{displayValue}</span>
      </div>
      <input 
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-[var(--line)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
      />
    </label>
  );
}

function SummaryRow({ label, value, tooltip }: { label: string, value: number, tooltip: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-[var(--line)] border-dashed last:border-0">
      <span className="font-bold text-[var(--muted)] flex items-center gap-2">
        {label}
        <InfoTooltip tooltip={tooltip} />
      </span>
      <span className="font-bold text-lg">{money(value * 100)}</span>
    </div>
  );
}

function InfoTooltip({ tooltip }: { tooltip: string }) {
  return (
    <div className="group relative inline-flex items-center justify-center w-[1.1rem] h-[1.1rem] rounded-full bg-[var(--line)] text-[var(--muted)] text-[0.7rem] font-black italic cursor-help">
      i
      <div className="absolute bottom-[140%] left-1/2 -translate-x-1/2 bg-[var(--panel-raised)] border border-[var(--line)] px-3 py-2 rounded-lg text-[var(--ink)] text-[0.75rem] font-semibold whitespace-nowrap opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 shadow-xl z-50">
        {tooltip}
      </div>
    </div>
  );
}
