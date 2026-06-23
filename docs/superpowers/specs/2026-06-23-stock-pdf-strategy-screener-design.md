# Stock PDF Strategy Screener Design

## Goal

Rebuild the stock condition screener so it uses the trading strategy patterns summarized from `E:\Desktop\知识收集\gs学习\电子版游资实战交割单.pdf`, starting with rules that can be computed from the current stock universe, quote fields, and daily K-line history.

## Background

The current screener defines a few broad tags and strategy presets in `index.html`, but those presets are not a faithful mapping of the PDF's short-term trading systems. The current behavior also makes strategy results feel low-value because the strategy surface is mostly generic metrics such as PE, PB, ROE, simple volume, and a small number of coarse technical patterns.

The PDF contains strategy themes from several traders. The usable first pass is the portion that can be expressed with daily K-line and quote data:

- Strong-stock continuation after limit-up behavior.
- First-board limit-up trading.
- Reversal boards after recent limit-up and pullback.
- Dragon-head first negative candle and dragon-head pullback patterns.
- Third consecutive one-line limit-up queueing.
- Multi-board continuation and high-risk relay.
- Oversold first-board recovery.

The PDF also includes non-computable or currently unavailable signals such as current market theme, main-line leader identity, major good news, order queue strength, auction behavior, true intraday straight-line pull, and seat-level activity. These must not be silently treated as solved. They should appear as explanatory caveats in strategy descriptions or match reasons only when the current data supports them.

## Scope

In scope:

- Replace the existing default screener strategy presets with PDF-derived strategy presets.
- Expand the technical signal engine so it can evaluate the PDF-derived patterns from daily K-line data.
- Make condition results explain why a stock matched a strategy.
- Keep basic exchange, board, ST, industry, and metric filters as auxiliary filters.
- Keep custom strategy saving, sorting, pagination, expanded rows, and add-to-watchlist behavior.
- Add focused tests for each strategy pattern and for result explanation output.

Out of scope for this pass:

- Real theme or concept-board ranking.
- Seal order amount, auction queue, order-book limit-up queueing, and tick-level straight-line pull.
- Dragon Tiger List, seat attribution, and hot-money identity.
- Server-side real-data screener parity. The real provider path remains front-end filtering over `stockUniverse`.
- Trading advice or automatic buy/sell execution.

## Architecture

The first implementation should stay inside the existing single-page `index.html` stock module, but split responsibilities inside that file more clearly:

- Strategy definitions: a data list of PDF-derived strategies, each with an id, name, description, risk level, source note, and condition object.
- Signal calculation: pure helper functions that read `stock.dailyK`, `stock.history`, and quote fields and return a normalized technical signal object.
- Condition matching: a single matcher that combines auxiliary filters and strategy-specific technical pattern checks.
- Match explanation: a helper that converts the computed signal values into short result reasons such as `首板`, `量比 2.1`, `近6日曾涨停`, `三板一字`.
- UI rendering: the existing filter panel and result table render strategy cards first and use match explanations in rows and detail views.

No new dependencies are required.

## Strategy Mapping

### First Board 打板

PDF basis: Zhao Laoge's system summary emphasizes first-board limit-up trading and T+1 short-term execution.

Computable rule:

- Latest daily bar is limit-up.
- Previous daily bar is not limit-up.
- Stock is not ST or delisting risk.
- Exclude Beijing Stock Exchange by default.
- Latest close is at or above MA5.
- Volume ratio is at least 1.3 by default.

### Oversold First Board 超跌一板

PDF basis: Zuoshou Xinyi's early pattern includes oversold first-board attempts.

Computable rule:

- Latest daily bar is first-board limit-up.
- The close before the limit-up is down at least 8% from the prior 5-day starting close.
- Volume ratio is at least 1.2 by default.

### Reversal Board 反包板

PDF basis: both Lin Fengkuang and Zuoshou Xinyi examples describe recent limit-up followed by adjustment and another limit-up, with the strongest form being limit-up, sharp adjustment, then limit-up again.

Computable rule:

- Latest daily bar is limit-up.
- At least one of the previous 2-6 bars was limit-up.
- The latest close is within 0.5% of, or above, the recent pre-latest high.
- Require at least one intervening non-limit-up bar between the earlier limit-up and today's limit-up, with that bar closing below its previous close or below the earlier limit-up high.
- Volume ratio is at least 1.2 by default.

### Dragon First Negative 龙头首阴

PDF basis: Lin Fengkuang and Qiao Bangzhu examples describe first-negative-candle opportunities after strong consecutive limit-ups.

Computable rule:

- A recent streak of at least 3 consecutive limit-up bars occurred before the latest bar.
- Latest bar is not limit-up.
- Latest bar is a negative candle or weak close.
- Latest close remains above MA5 or above the 10-day trend floor.
- Latest turnover/volume is meaningfully active, using volume ratio >= 1.0 as the first-pass proxy.

This strategy should be marked as "observation" rather than a hard buy signal because current data cannot identify whether the stock is the actual market leader.

### Dragon Pullback 龙回头

PDF basis: Lin Fengkuang's summary notes strong hot stocks after continuous limit-ups can be traded after opening or pullback as first-negative, upper-shadow reversal, or dragon pullback.

Computable rule:

- A recent streak of at least 2 consecutive limit-up bars occurred in the previous 10 bars.
- Latest close is above MA5 or recovers back above MA5.
- Latest close is within 12% of the recent high.
- Latest volume ratio is at least 1.2.
- Latest change is positive or the latest close is above the previous close.

### Third One-Line Limit 三板一字

PDF basis: Zuoshou Xinyi's independent pattern queues the third consecutive one-line limit-up because the first two boards often have little disagreement and the third board can show small disagreement and fill chances.

Computable rule:

- Consecutive limit-up count is exactly 3 or at least 3.
- The latest bar is a one-line limit-up.
- The previous two bars are also one-line limit-ups.
- Latest volume ratio is greater than or equal to the previous one-line average by a small margin, or at least 0.8 when historical volumes are sparse.

### Multi-Board Relay 连板接力

PDF basis: Zuoshou Xinyi evolved toward multi-board and fast relay patterns, including 2-board, 3-board, 4-board, and higher boards.

Computable rule:

- Consecutive limit-up count is at least 2.
- Latest bar is limit-up.
- Sort priority can favor higher consecutive limit count, then volume ratio, then market cap if available.
- Mark one-line boards separately because they are harder to buy and riskier on breaks.

### Strong Trend Breakout 强势趋势突破

PDF basis: multiple examples describe strong stocks, trend breakout, MA alignment, and buying near acceleration points.

Computable rule:

- Latest close is above MA5 and MA10.
- MA5 is above or equal to previous MA5.
- Latest high or close breaks the highest high of the previous 5 bars.
- Volume ratio is at least 1.3.
- Latest change is positive.

## Data Flow

1. `loadRealStockUniverse()` loads stocks into `stockUniverse`.
2. Existing preloading and row expansion continue to load daily K-line data for active/visible stocks.
3. `getStockKLineSeries(stock)` remains the canonical source for daily bars.
4. `getStockTechnicalSignals(stock)` is expanded with strategy-specific metrics:
   - `limitUp`
   - `firstBoard`
   - `oneLineBoard`
   - `consecutiveLimitCount`
   - `recentLimitCount`
   - `recentLimitHigh`
   - `volumeRatio`
   - `ma5`, `ma10`, `ma20`
   - `reversalBoard`
   - `oversoldFirstBoard`
   - `dragonFirstNegative`
   - `dragonPullback`
   - `thirdOneLineBoard`
   - `multiBoardRelay`
   - `strongTrendBreakout`
5. `stockMatchesTechnicalPattern(stock, pattern)` maps strategy pattern ids to those computed booleans.
6. `getStockMatchReasons(stock, conditions)` returns display reasons for the selected strategy and active filters.
7. `getStockFilterResults()` filters `stockUniverse`, sorts results, and renders reasons in the table.

## UI Design

The condition screener should become strategy-first:

- Strategy cards replace the current "游资短线模式" list with PDF-derived presets.
- Each strategy card shows a short strategy name, a concise source note, and a risk label such as `观察`, `进攻`, or `高风险`.
- Basic filters remain under the strategy area:
  - Exchange/board/ST filters.
  - Technical shape override.
  - Volume ratio range.
  - MA position.
  - Optional PE/PB/ROE/industry auxiliary filters.
- The result table keeps columns for name, code, price, change, volume, PE, market cap, and actions.
- Add one compact "命中原因" line inside the stock name cell or expanded detail row.
- Empty state should say whether no stock matched the selected PDF strategy or whether required K-line data is missing.

The current purple glass style can remain. No broad visual redesign is needed.

## Error Handling

- If a stock has fewer than the required daily bars for a strategy, the strategy should not match and the reason helper should include `K线不足` only in expanded diagnostics, not as a positive reason.
- If historical data is missing for many stocks, the result count can be low. The page should keep the existing data-source status and avoid pretending all strategies were evaluated with complete data.
- Unknown technical pattern ids should fail closed for strategy matching. The explicit `all` value remains the only no-op technical pattern.
- Legacy custom strategies should continue to load. If they reference removed pattern ids, they should not crash and should produce no technical-pattern match.

## Testing

Use the existing `node --test tests/stocks-module.test.js` pattern that extracts pure functions from `index.html`.

Required tests:

- First-board strategy matches a first limit-up with volume and rejects an existing consecutive board.
- Oversold first-board matches after a short-term drawdown and rejects a non-oversold first board.
- Reversal board matches recent limit-up, pullback, and renewed limit-up near prior high.
- Dragon first-negative matches after at least three consecutive limit-ups followed by a weak non-limit-up bar.
- Dragon pullback matches after recent consecutive limit-ups, MA recovery, and volume expansion.
- Third one-line board matches three consecutive one-line limit-up bars.
- Multi-board relay matches at least two consecutive limit-up bars.
- Strong trend breakout matches MA alignment, recent-high breakout, and volume expansion.
- Result reasons include the selected strategy label and numeric volume ratio.
- Strategy card wiring includes the PDF-derived strategy ids and no longer depends on the previous generic strategy names.

## Acceptance Criteria

- Opening 条件选股 defaults to a strategy-first screener rather than generic metrics-first filtering.
- Selecting each built-in strategy filters all currently loaded `stockUniverse` items.
- Built-in strategies are traceable to the PDF-derived patterns listed above.
- Results show why a stock matched.
- Existing watchlist, add-to-watchlist, sorting, pagination, expanded row, and custom strategy saving continue to work.
- The focused stock module tests pass.

## Implementation Notes

- Keep the first pass front-end only.
- Do not add new external packages.
- Prefer pure helper functions for strategy calculations so tests can exercise behavior without a browser.
- Preserve the current localStorage keys for custom strategies and filter state.
- Temporary OCR files produced during analysis must not be committed.

