/* JanAwaaz shared sync layer
 *
 * JanAwaaz is the single complaint entry point. When a complaint is
 * classified, `dispatch()` writes it into the matching department's own
 * localStorage store. Any open tab of that department (same origin) receives
 * a `storage` event, re-renders, and shows a notification.
 *
 * Two-way: department status changes are pushed back into the JanAwaaz record
 * via `syncStatus()` so the public tracking page reflects them.
 */
window.JASync = (function () {
  var DEPT_KEYS = {
    Water: "water_dept_complaints_v1",
    Electricity: "electricity_dept_complaints_v1",
    Fire: "fire_dept_complaints_v1",
    Road: "road_dept_complaints_v1",
    "Police/Safety": "police_dept_complaints_v1"
  };
  var DEPT_NAMES = {
    water_dept_complaints_v1: "Municipal Water Board",
    electricity_dept_complaints_v1: "Electricity Distribution Board",
    fire_dept_complaints_v1: "City Fire & Rescue",
    road_dept_complaints_v1: "Public Works — Roads Division",
    police_dept_complaints_v1: "City Police Department"
  };

  function readJSON(key, fb) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v === null ? fb : v;
    } catch (e) {
      return fb;
    }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m];
    });
  }
  function deptNameFor(key) {
    return DEPT_NAMES[key] || key;
  }

  /* JanAwaaz -> department: push a complaint into the department's store. */
  function dispatch(record) {
    var key = DEPT_KEYS[record.category];
    if (!key) return { key: null, name: null, record: null };
    var list = readJSON(key, []);
    var deptRec = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      janAwaazId: record.id,
      name: "Anonymous (via JanAwaaz)",
      contact: "—",
      type: record.category,
      location: record.loc || "Not specified",
      details: record.scrubbedDesc || record.rawDesc,
      time: Date.now(),
      status: "new",
      source: "JanAwaaz"
    };
    list.push(deptRec);
    writeJSON(key, list);
    return { key: key, name: DEPT_NAMES[key] || key, record: deptRec };
  }

  /* department -> JanAwaaz: back-sync a status change into the public record. */
  function syncStatus(janAwaazId, status, deptName, note, officer) {
    if (!janAwaazId || !status) return;
    var records = readJSON("janawaaz_records", {});
    var rec = records[janAwaazId];
    if (!rec) return;
    rec.status = status;
    rec.history = rec.history || [];
    var stage = status === "resolved" ? "Resolved by " + deptName : "Update from " + deptName;
    rec.history.push({
      stage: stage,
      time: new Date().toISOString(),
      note: note || "",
      officer: officer || ""
    });
    writeJSON("janawaaz_records", records);
  }

  /* Every department's store, flattened with the key attached. Used by the
   * officer console to build one cross-department queue. */
  function readAllDepts() {
    var out = [];
    Object.keys(DEPT_KEYS).forEach(function (category) {
      var key = DEPT_KEYS[category];
      readJSON(key, []).forEach(function (rec) {
        out.push({
          storeKey: key,
          category: category,
          deptName: DEPT_NAMES[key] || key,
          record: rec
        });
      });
    });
    return out;
  }

  /* Move a complaint to another department's store, keeping its id and history
   * so the JanAwaaz tracking record still lines up. Returns the new entry. */
  function reassign(storeKey, janAwaazId, targetKey) {
    if (!storeKey || !targetKey || storeKey === targetKey) return null;
    var list = readJSON(storeKey, []);
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(janAwaazId)) { idx = i; break; }
    }
    if (idx === -1) return null;
    var moving = list.splice(idx, 1)[0];
    writeJSON(storeKey, list);
    var target = readJSON(targetKey, []);
    moving.reassignedFrom = DEPT_NAMES[storeKey] || storeKey;
    target.push(moving);
    writeJSON(targetKey, target);
    return { entry: moving, from: DEPT_NAMES[storeKey] || storeKey, to: DEPT_NAMES[targetKey] || targetKey };
  }

  /* In-page toast + desktop notification (used by department pages on arrival). */
  function notify(title, body) {
    try {
      if ("Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(title, { body: body, tag: "jasync" });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission();
        }
      }
    } catch (e) {}
    var t = document.getElementById("jasync-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "jasync-toast";
      t.style.cssText =
        "position:fixed;top:12px;right:12px;z-index:2147483000;max-width:280px;" +
        "background:#111827;color:#f3f4f6;border:1px solid #22d3a8;border-left:4px solid #22d3a8;" +
        "border-radius:10px;padding:12px 14px;font:13px/1.4 sans-serif;" +
        "box-shadow:0 10px 30px rgba(0,0,0,.4);opacity:0;transform:translateY(-8px);transition:all .25s ease;";
      document.body.appendChild(t);
    }
    t.innerHTML = "<b>" + esc(title) + "</b><br><span style='opacity:.85'>" + esc(body) + "</span>";
    t.style.opacity = "1";
    t.style.transform = "translateY(0)";
    clearTimeout(t._hide);
    t._hide = setTimeout(function () {
      t.style.opacity = "0";
      t.style.transform = "translateY(-8px)";
    }, 6000);
  }

  return {
    DEPT_KEYS: DEPT_KEYS,
    DEPT_NAMES: DEPT_NAMES,
    readJSON: readJSON,
    writeJSON: writeJSON,
    esc: esc,
    deptNameFor: deptNameFor,
    dispatch: dispatch,
    syncStatus: syncStatus,
    readAllDepts: readAllDepts,
    reassign: reassign,
    notify: notify
  };
})();