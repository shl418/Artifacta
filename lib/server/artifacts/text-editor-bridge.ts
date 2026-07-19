import { instrumentEditableHtml } from "@/lib/server/artifacts/text-editor"

export function injectTextEditorBridge(html: string) {
  const instrumented = instrumentEditableHtml(html)
  const payload = `<style>
html.artifacta-editor-active,html.artifacta-editor-active *{cursor:text!important}
#artifacta-editor-hover{position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #2563eb;border-radius:4px;background:rgba(37,99,235,.08);display:none}
.artifacta-inline-editor{outline:2px solid #2563eb!important;outline-offset:2px;background:rgba(255,255,255,.96)!important;color:inherit!important;font:inherit!important;letter-spacing:inherit!important;text-transform:inherit!important;white-space:inherit!important;min-width:1ch}
</style><script>${editorBridgeSource()}</script>`

  if (/<head[^>]*>/i.test(instrumented.html)) {
    return instrumented.html.replace(/<head([^>]*)>/i, `<head$1>${payload}`)
  }
  return `${payload}${instrumented.html}`
}

function editorBridgeSource() {
  return String.raw`(() => {
  "use strict";
  const START = "artifacta-text-start:";
  const END = "artifacta-text-end:";
  let port = null;
  let active = true;
  let editing = null;
  const records = new Map();
  const hover = document.createElement("div");
  hover.id = "artifacta-editor-hover";

  function send(message) {
    if (port) port.postMessage(message);
  }

  function collect() {
    records.clear();
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
    const starts = new Map();
    while (walker.nextNode()) {
      const comment = walker.currentNode;
      const value = comment.nodeValue || "";
      if (value.startsWith(START)) {
        starts.set(value.slice(START.length), comment);
      } else if (value.startsWith(END)) {
        const key = value.slice(END.length);
        const start = starts.get(key);
        const textNode = start && start.nextSibling;
        if (start && textNode && textNode.nodeType === Node.TEXT_NODE) {
          records.set(key, {
            key,
            start,
            end: comment,
            textNode,
            baseText: textNode.nodeValue || "",
          });
        }
      }
    }
    send({ type: "ready", editable_count: visibleRecords().length });
  }

  function visibleRecords() {
    return Array.from(records.values()).filter((record) => {
      const parent = record.textNode.parentElement;
      if (!parent) return false;
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const range = document.createRange();
      range.selectNodeContents(record.textNode);
      return Array.from(range.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
    });
  }

  function recordAtPoint(x, y) {
    let best = null;
    let bestArea = Infinity;
    for (const record of visibleRecords()) {
      const range = document.createRange();
      range.selectNodeContents(record.textNode);
      for (const rect of range.getClientRects()) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          const area = rect.width * rect.height;
          if (area < bestArea) {
            best = record;
            bestArea = area;
          }
        }
      }
    }
    return best;
  }

  function showHover(record) {
    if (!active || editing || !record) {
      hover.style.display = "none";
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(record.textNode);
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      hover.style.display = "none";
      return;
    }
    hover.style.display = "block";
    hover.style.left = (rect.left - 3) + "px";
    hover.style.top = (rect.top - 3) + "px";
    hover.style.width = (rect.width + 6) + "px";
    hover.style.height = (rect.height + 6) + "px";
  }

  function finishEditing(commit) {
    if (!editing) return;
    const { record, element } = editing;
    const value = commit ? (element.textContent || "") : record.textNode.nodeValue || "";
    const nextText = document.createTextNode(value);
    element.replaceWith(nextText);
    record.textNode = nextText;
    editing = null;
    hover.style.display = "none";
    if (commit) {
      send({
        type: "change",
        text_key: record.key,
        before: record.baseText,
        after: value,
        context: (nextText.parentElement && nextText.parentElement.textContent || "").trim().slice(0, 160),
      });
    }
  }

  function beginEditing(record) {
    if (!active || editing) return;
    const element = document.createElement("span");
    element.className = "artifacta-inline-editor";
    element.contentEditable = "plaintext-only";
    element.spellcheck = true;
    element.textContent = record.textNode.nodeValue || "";
    record.textNode.replaceWith(element);
    editing = { record, element };
    hover.style.display = "none";
    element.focus({ preventScroll: true });
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    send({ type: "selected", text_key: record.key });

    element.addEventListener("beforeinput", (event) => {
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        event.preventDefault();
        finishEditing(true);
      }
    });
    element.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = (event.clipboardData && event.clipboardData.getData("text/plain") || "").replace(/[\r\n]+/g, " ");
      document.execCommand("insertText", false, text);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finishEditing(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finishEditing(false);
      }
    });
    element.addEventListener("blur", () => finishEditing(true), { once: true });
  }

  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "artifacta:connect" || !event.ports || !event.ports[0]) return;
    event.stopImmediatePropagation();
    port = event.ports[0];
    port.onmessage = (portEvent) => {
      const message = portEvent.data || {};
      if (message.type === "set_mode") {
        finishEditing(true);
        active = Boolean(message.active);
        document.documentElement.classList.toggle("artifacta-editor-active", active);
        hover.style.display = "none";
      } else if (message.type === "apply_change") {
        const record = records.get(message.text_key);
        if (record && typeof message.after === "string") {
          record.textNode.nodeValue = message.after;
        }
      } else if (message.type === "focus_text") {
        const record = records.get(message.text_key);
        if (record) {
          record.textNode.parentElement && record.textNode.parentElement.scrollIntoView({ block: "center", behavior: "smooth" });
          showHover(record);
        }
      }
    };
    port.start();
    collect();
  }, true);

  document.addEventListener("pointermove", (event) => {
    if (!active || editing) return;
    showHover(recordAtPoint(event.clientX, event.clientY));
  }, true);

  document.addEventListener("click", (event) => {
    if (!active) return;
    const record = recordAtPoint(event.clientX, event.clientY);
    event.preventDefault();
    event.stopImmediatePropagation();
    if (record) beginEditing(record);
  }, true);

  document.addEventListener("submit", (event) => {
    if (active) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.classList.add("artifacta-editor-active");
    document.body.appendChild(hover);
    collect();
  }, { once: true });
})();`.replace(/<\/script/gi, "<\\/script")
}
