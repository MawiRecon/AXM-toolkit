/* =====================================================================
   Ax Billing Tracker — rebate engine
   ---------------------------------------------------------------------
   The ONLY place the billing math lives. Ported 1:1 from the
   NEW_2026_Master_Billing tab and parity-tested against all 286 rows
   (0 discrepancies). If a number is ever wrong, it is wrong here and
   only here.

   Sheet column -> field:
     B End Month .............. month      = month name of Campaign End (E)
     J Delta .................. delta      = H - I
     L Invoice Rebate Value ... rebateValue = K * I
     M Sent to Grapeseed ...... sentToGrapeseed = I - (I*K)
     O Gross Profit ........... grossProfit = I * N
     P Total Back-End Rebate .. backendRebate  = (O/2) - L   [override-able]
     Q Difference Owed ........ differenceOwed = P - R        [override-able]

   Every derived field is null when its inputs are missing, so a
   half-entered row shows blanks exactly like the spreadsheet.
   ===================================================================== */
(function (root) {
  "use strict";

  var MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

  function n(v) {                    // coerce to number or null
    if (v === null || v === undefined || v === "") return null;
    var x = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(x) ? x : null;
  }

  function monthName(endISO) {
    if (!endISO) return "TBD";
    var m = parseInt(String(endISO).slice(5, 7), 10);
    return (m >= 1 && m <= 12) ? MONTHS[m - 1] : "TBD";
  }

  /* Given a stored row (entered fields + optional overrides), return all
     seven derived values. Overrides win over the formula when present. */
  function derive(row) {
    var io   = n(row.io_amount);
    var act  = n(row.actual_spend);
    var pct  = n(row.rebate_pct);
    var mar  = n(row.margin);
    var prev = n(row.previous_backend);

    var end   = row.campaign_end   || row.end   || null;  // col E
    var start = row.campaign_start || row.start || null;  // col D
    var year  = start ? parseInt(String(start).slice(0, 4), 10) : null;  // col C = year of start
    if (!isFinite(year)) year = null;

    var delta = (io !== null && act !== null) ? io - act : null;
    var rebateValue = (pct !== null && act !== null) ? pct * act : null;
    var sentToGrapeseed = (pct !== null && act !== null) ? act - (act * pct) : null;
    var grossProfit = (act !== null && mar !== null) ? act * mar : null;

    var pFormula = (grossProfit !== null && rebateValue !== null)
      ? grossProfit / 2 - rebateValue : null;
    var pOverride = n(row.backend_rebate_override);
    var backendRebate = pOverride !== null ? pOverride : pFormula;

    var qFormula = (backendRebate !== null && prev !== null) ? backendRebate - prev : null;
    var qOverride = n(row.difference_owed_override);
    var differenceOwed = qOverride !== null ? qOverride : qFormula;

    return {
      month:           monthName(end),
      year:            year,
      delta:           delta,
      rebate_value:    rebateValue,
      sent_to_grapeseed: sentToGrapeseed,
      gross_profit:    grossProfit,
      backend_rebate:  backendRebate,
      difference_owed: differenceOwed,
      // surfaced so the UI can flag a hand-set cell and offer "reset to formula"
      _backend_rebate_isOverride:  pOverride !== null,
      _difference_owed_isOverride: qOverride !== null,
      _backend_rebate_formula:  pFormula,
      _difference_owed_formula: qFormula
    };
  }

  /* Compose the finalized IO name used in column A:
     "Entity | Advertiser | Campaign | Flight Start" (actual start date). */
  function composeName(row) {
    var start = row.campaign_start || row.start || "";
    var parts = [row.entity, row.advertiser, (row.campaign_label || row.campaign), start]
      .map(function (p) { return (p == null ? "" : String(p).trim()); })
      .filter(function (p) { return p !== ""; });
    return parts.join(" | ");
  }

  var api = { derive: derive, monthName: monthName, composeName: composeName, MONTHS: MONTHS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Rebate = api;
})(typeof self !== "undefined" ? self : this);
