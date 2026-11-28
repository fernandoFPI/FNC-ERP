// The Performance tab of an employee: how their requisitions fared at each approval, whose work was sent back, how Finance judged their
// purchase orders, what happened to the claims they filed and, for people who approve things, how fast they answer.
// Every figure comes from the gateway's `employeePerformance` query (read from the logs on each open, nothing stored). The rates and the
// wording of a time are decided in lib/employeePerformance.ts. There is deliberately no score and no ranking.
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@apollo/client'
import { EMPLOYEE_PERFORMANCE_QUERY } from '../../../graphql/hr'
import type {
  EmployeePerformanceQuery,
  EmployeePerformanceQueryVariables,
} from '../../../graphql/generated'
import { useTheme } from '../../../theme/ThemeContext'
import { Card } from '../../../components/ui/Card'
import { ActionButton } from '../../../components/ui/ActionButton'
import {
  DEFAULT_PERFORMANCE_DAYS,
  PERFORMANCE_PERIODS,
  barMax,
  busiestApproverKind,
  ratePercent,
  rateText,
  waitText,
} from '../../../lib/employeePerformance'

type Perf = NonNullable<EmployeePerformanceQuery['employeePerformance']>

function monthLabel(month: string, lang: string): string {
  const d = new Date(`${month}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return month
  return new Intl.DateTimeFormat(lang, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    d,
  )
}

function useStyles() {
  const { theme } = useTheme()
  const label: CSSProperties = { color: theme.textSecondary, fontSize: 12.5, fontWeight: 500 }
  const figure: CSSProperties = {
    color: theme.textPrimary,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  }
  const sectionTitle: CSSProperties = {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
  }
  const sectionSub: CSSProperties = {
    color: theme.textSecondary,
    fontSize: 13,
    margin: '2px 0 14px',
  }
  const th: CSSProperties = {
    textAlign: 'start',
    color: theme.textSecondary,
    fontWeight: 500,
    fontSize: 13,
    padding: '6px 8px',
    borderBottom: `1px solid ${theme.border}`,
  }
  const td: CSSProperties = {
    padding: '8px',
    borderBottom: `1px solid ${theme.border}`,
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
    color: theme.textPrimary,
  }
  const num: CSSProperties = { textAlign: 'end' }
  return { theme, label, figure, sectionTitle, sectionSub, th, td, num }
}

function useWait() {
  const { t } = useTranslation()
  return (hours: number | null | undefined): string => {
    const w = waitText(hours)
    return w === null ? '—' : t(`hr.performance.${w.unit}`, { value: w.value })
  }
}

function Tile({ name, value, sub }: { name: string; value: ReactNode; sub?: ReactNode }) {
  const { theme, label, figure } = useStyles()
  return (
    <div
      style={{
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        minWidth: 0,
      }}
    >
      <div style={label}>{name}</div>
      <div style={{ ...figure, fontSize: 26, marginTop: 2 }}>{value}</div>
      {sub ? (
        <div
          style={{ color: theme.textSecondary, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  )
}

function Bars({
  rows,
  drill,
  openStage,
  setOpenStage,
}: {
  rows: {
    key: string
    name: string
    count: number
    examples?: { number: string; note: string | null }[]
  }[]
  drill?: string
  openStage: string | null
  setOpenStage: (v: string | null) => void
}) {
  const { t } = useTranslation()
  const { theme, figure } = useStyles()
  const max = barMax(rows.map((r) => r.count))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r) => {
        const canOpen = drill !== undefined && r.count > 0 && (r.examples?.length ?? 0) > 0
        const isOpen = canOpen && openStage === `${drill}:${r.key}`
        const bar = (
          <>
            <span
              style={{
                fontSize: 13,
                color: theme.textPrimary,
                minWidth: 0,
                overflowWrap: 'anywhere',
              }}
            >
              {r.name}
            </span>
            <span
              style={{
                height: 12,
                background: theme.hbarTrack,
                borderRadius: 6,
                overflow: 'hidden',
                border: `1px solid ${theme.border}`,
              }}
              aria-hidden="true"
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${(r.count * 100) / max}%`,
                  background: theme.accent,
                  borderRadius: 6,
                }}
              />
            </span>
            <span style={{ ...figure, textAlign: 'end' }}>{r.count}</span>
          </>
        )
        const rowStyle: CSSProperties = {
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 210px) 1fr 40px',
          gap: 10,
          alignItems: 'center',
          padding: '5px 6px',
          borderRadius: 8,
          width: '100%',
          textAlign: 'start',
          font: 'inherit',
          border: 0,
          background: isOpen ? theme.accentBg : 'transparent',
          color: 'inherit',
        }
        return (
          <div key={r.key}>
            {canOpen ? (
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpenStage(isOpen ? null : `${drill}:${r.key}`)
                }}
                style={{ ...rowStyle, cursor: 'pointer' }}
              >
                {bar}
              </button>
            ) : (
              <div style={rowStyle}>{bar}</div>
            )}
            {isOpen ? (
              <div
                style={{
                  margin: '2px 6px 8px',
                  padding: '10px 12px',
                  borderInlineStart: `3px solid ${theme.accent}`,
                  background: theme.bgCanvas,
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ color: theme.textSecondary }}>{t('hr.performance.drillTitle')}</div>
                <ul style={{ margin: '6px 0 0', paddingInlineStart: 18, color: theme.textPrimary }}>
                  {(r.examples ?? []).map((e, i) => (
                    <li key={`${e.number}-${i}`}>
                      <span style={figure}>{e.number}</span>
                      <span
                        style={{ color: theme.textSecondary }}
                      >{`: ${e.note?.trim() ? e.note : t('hr.performance.noNote')}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function PerformanceBody({
  perf,
  openStage,
  setOpenStage,
}: {
  perf: Perf
  openStage: string | null
  setOpenStage: (v: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const { theme, figure, sectionTitle, sectionSub, th, td, num } = useStyles()
  const wait = useWait()
  const r = perf.requisitions
  const audit = perf.audit
  const auditTotal = audit.passedFirst + audit.returned + audit.passedAfterReturn
  const expense = perf.claims.find((c) => c.key === 'expense_claim') ?? {
    key: 'expense_claim',
    filed: 0,
    rejected: 0,
  }
  const busiest = busiestApproverKind(perf.approver)
  const lang = i18n.language
  const maxTrend = barMax(perf.trend.map((m) => m.sentBack))
  const auditRows: { key: string; name: string; n: number }[] = [
    { key: 'first', name: t('hr.performance.auditPassedFirst'), n: audit.passedFirst },
    { key: 'returned', name: t('hr.performance.auditReturned'), n: audit.returned },
    { key: 'after', name: t('hr.performance.auditPassedAfter'), n: audit.passedAfterReturn },
  ]
  return (
    <>
      {!perf.linked ? (
        <div
          role="note"
          style={{
            background: theme.warningBg,
            border: `1px solid ${theme.warningBorder}`,
            color: theme.warning,
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
          }}
        >
          {t('hr.performance.notLinked')}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 12,
        }}
      >
        <Tile
          name={t('hr.performance.tileOrganized')}
          value={r.organized}
          sub={t('hr.performance.organizedSub', {
            completed: r.completed,
            inProgress: r.inProgress,
            cancelled: r.cancelled,
          })}
        />
        <Tile
          name={t('hr.performance.tileSentBack')}
          value={rateText(r.sentBack, r.organized)}
          sub={t('hr.performance.ofRequisitions', { part: r.sentBack, total: r.organized })}
        />
        <Tile
          name={t('hr.performance.tileAudit')}
          value={rateText(audit.passedFirst, auditTotal)}
          sub={t('hr.performance.ofPOs', { part: audit.passedFirst, total: auditTotal })}
        />
        <Tile
          name={t('hr.performance.tileClaims')}
          value={rateText(expense.rejected, expense.filed)}
          sub={t('hr.performance.ofClaims', { part: expense.rejected, total: expense.filed })}
        />
        {busiest ? (
          <Tile
            name={t('hr.performance.tileMedian')}
            value={wait(busiest.medianHours)}
            sub={t('hr.performance.medianSub', {
              kind: t(`hr.performance.approverKind.${busiest.key}`),
            })}
          />
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
          gap: 16,
        }}
      >
        <Card>
          <h2 style={sectionTitle}>{t('hr.performance.stagesTitle')}</h2>
          <p style={sectionSub}>{t('hr.performance.stagesSub')}</p>
          <Bars
            openStage={openStage}
            setOpenStage={setOpenStage}
            drill="stage"
            rows={perf.sentBackStages.map((s) => ({
              key: s.key,
              name: t(`hr.performance.stage.${s.key}`),
              count: s.count,
              examples: s.examples,
            }))}
          />
        </Card>
        <Card>
          <h2 style={sectionTitle}>{t('hr.performance.workTitle')}</h2>
          <p style={sectionSub}>{t('hr.performance.workSub')}</p>
          <Bars
            openStage={openStage}
            setOpenStage={setOpenStage}
            rows={perf.workSentBack.map((w) => ({
              key: w.key,
              name: t(`hr.performance.work.${w.key}`),
              count: w.count,
            }))}
          />
        </Card>
      </div>

      <Card>
        <h2 style={sectionTitle}>{t('hr.performance.trendTitle')}</h2>
        <p style={sectionSub}>{t('hr.performance.trendSub')}</p>
        <div
          style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 120, paddingTop: 6 }}
        >
          {perf.trend.map((m, i) => {
            const pct = ratePercent(m.sentBack, m.total)
            const name = monthLabel(m.month, lang)
            const last = i === perf.trend.length - 1
            return (
              <div
                key={m.month}
                role="img"
                aria-label={t('hr.performance.trendAria', {
                  month: name,
                  part: m.sentBack,
                  total: m.total,
                  rate: pct === null ? '—' : `${pct}%`,
                })}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  justifyContent: 'flex-end',
                  height: '100%',
                }}
              >
                <span style={{ ...figure, fontSize: 11 }}>{pct === null ? '—' : `${pct}%`}</span>
                <span
                  style={{
                    width: '100%',
                    maxWidth: 38,
                    height: `${Math.max(4, (m.sentBack * 80) / maxTrend)}px`,
                    background: last ? theme.accent : theme.accentBorder,
                    borderRadius: '5px 5px 0 0',
                  }}
                />
                <span style={{ fontSize: 11, color: theme.textSecondary }}>{name}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: theme.textSecondary,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >{`${m.sentBack}/${m.total}`}</span>
              </div>
            )
          })}
        </div>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
          gap: 16,
        }}
      >
        <Card>
          <h2 style={sectionTitle}>{t('hr.performance.auditTitle')}</h2>
          <p style={sectionSub}>{t('hr.performance.auditSub')}</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{t('hr.performance.colResult')}</th>
                  <th style={{ ...th, ...num }}>{t('hr.performance.colPOs')}</th>
                  <th style={{ ...th, ...num }}>{t('hr.performance.colShare')}</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((a) => (
                  <tr key={a.key}>
                    <td style={td}>{a.name}</td>
                    <td style={{ ...td, ...num }}>{a.n}</td>
                    <td style={{ ...td, ...num }}>{rateText(a.n, auditTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <h2 style={sectionTitle}>{t('hr.performance.claimsTitle')}</h2>
          <p style={sectionSub}>{t('hr.performance.claimsSub')}</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{t('hr.performance.colType')}</th>
                  <th style={{ ...th, ...num }}>{t('hr.performance.colFiled')}</th>
                  <th style={{ ...th, ...num }}>{t('hr.performance.colRejected')}</th>
                  <th style={{ ...th, ...num }}>{t('hr.performance.colRate')}</th>
                </tr>
              </thead>
              <tbody>
                {perf.claims.map((c) => (
                  <tr key={c.key}>
                    <td style={td}>{t(`hr.performance.claim.${c.key}`)}</td>
                    <td style={{ ...td, ...num }}>{c.filed}</td>
                    <td style={{ ...td, ...num }}>{c.rejected}</td>
                    <td style={{ ...td, ...num }}>{rateText(c.rejected, c.filed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {perf.approver.length > 0 ? (
        <Card>
          <h2 style={sectionTitle}>{t('hr.performance.approverTitle')}</h2>
          <p style={sectionSub}>{t('hr.performance.approverSub')}</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{t('hr.performance.colKind')}</th>
                  <th style={{ ...th, ...num }}>{t('hr.performance.colApproved')}</th>
                  <th style={{ ...th, ...num }}>{t('hr.performance.colSentBack')}</th>
                  <th style={{ ...th, ...num }}>{t('hr.performance.colMedian')}</th>
                </tr>
              </thead>
              <tbody>
                {perf.approver.map((a) => (
                  <tr key={a.key}>
                    <td style={td}>{t(`hr.performance.approverKind.${a.key}`)}</td>
                    <td style={{ ...td, ...num }}>{a.approved}</td>
                    <td style={{ ...td, ...num }}>{a.sentBack}</td>
                    <td style={{ ...td, ...num }}>{wait(a.medianHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 style={sectionTitle}>{t('hr.performance.howTitle')}</h2>
        <ul
          style={{
            margin: '10px 0 0',
            padding: 0,
            listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '10px 24px',
            color: theme.textSecondary,
            fontSize: 13,
          }}
        >
          {(['how1', 'how2', 'how3', 'how4', 'how5', 'how6'] as const).map((k) => (
            <li key={k} style={{ display: 'flex', gap: 8 }}>
              <span aria-hidden="true" style={{ color: theme.accent }}>
                •
              </span>
              <span>{t(`hr.performance.${k}`)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

export function EmployeePerformanceTab({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation()
  const { theme, sectionTitle } = useStyles()
  const [days, setDays] = useState<number | null>(DEFAULT_PERFORMANCE_DAYS)
  const [openStage, setOpenStage] = useState<string | null>(null)

  const { data, loading, error, refetch } = useQuery<
    EmployeePerformanceQuery,
    EmployeePerformanceQueryVariables
  >(EMPLOYEE_PERFORMANCE_QUERY, {
    variables: { employeeId, days },
    fetchPolicy: 'cache-and-network',
  })
  const perf: Perf | null | undefined = data?.employeePerformance

  const periodLabel = (key: string) => t(`hr.performance.${key}`)
  const rangeLabel =
    days === 30
      ? t('hr.performance.range30')
      : days === 90
        ? t('hr.performance.range90')
        : days === 365
          ? t('hr.performance.range365')
          : t('hr.performance.rangeAll')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ ...sectionTitle, fontSize: 16 }}>{t('hr.performance.title')}</div>
          <div
            style={{ color: theme.textSecondary, fontSize: 13 }}
          >{`${rangeLabel} · ${t('hr.performance.rangeNote')}`}</div>
        </div>
        <div
          role="group"
          aria-label={t('hr.performance.period')}
          style={{
            display: 'inline-flex',
            border: `1px solid ${theme.borderField}`,
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {PERFORMANCE_PERIODS.map((p, i) => {
            const on = p.days === days
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setDays(p.days)
                  setOpenStage(null)
                }}
                style={{
                  font: 'inherit',
                  fontSize: 13,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  border: 0,
                  borderInlineStart: i === 0 ? 0 : `1px solid ${theme.border}`,
                  background: on ? theme.accentSolid : theme.bgSurface,
                  color: on ? theme.accentSolidText : theme.textSecondary,
                  fontWeight: on ? 600 : 400,
                }}
              >
                {periodLabel(p.key)}
              </button>
            )
          })}
        </div>
      </div>

      {error && !perf ? (
        <Card>
          <div role="alert" style={{ color: theme.danger, fontSize: 13, marginBottom: 10 }}>
            {t('hr.performance.loadError')}
          </div>
          <ActionButton variant="outline" onClick={() => void refetch()}>
            {t('hr.performance.tryAgain')}
          </ActionButton>
        </Card>
      ) : !perf ? (
        <Card>
          <div style={{ color: theme.textSecondary, fontSize: 13 }}>
            {loading ? t('hr.performance.loading') : t('hr.performance.notFound')}
          </div>
        </Card>
      ) : (
        <PerformanceBody perf={perf} openStage={openStage} setOpenStage={setOpenStage} />
      )}
    </div>
  )
}
