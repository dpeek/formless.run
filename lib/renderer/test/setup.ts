if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => true,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

if (typeof window !== "undefined") {
  window.scrollTo = () => undefined;
}

if (typeof globalThis.CSS === "undefined") {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: {},
  });
}

if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
}

if (typeof HTMLDialogElement !== "undefined") {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  }

  if (typeof HTMLDialogElement.prototype.close !== "function") {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  }
}

if (typeof HTMLElement !== "undefined") {
  if (typeof HTMLElement.prototype.showPopover !== "function") {
    HTMLElement.prototype.showPopover = function showPopover() {
      this.setAttribute("popover-open", "");
      this.style.display = "block";
    };
  }

  if (typeof HTMLElement.prototype.hidePopover !== "function") {
    HTMLElement.prototype.hidePopover = function hidePopover() {
      this.removeAttribute("popover-open");
      this.style.display = "none";
    };
  }

  HTMLElement.prototype.matches = function matchesSelector(this: HTMLElement, selector: string) {
    return selector === ":popover-open"
      ? this.hasAttribute("popover-open")
      : Element.prototype.matches.call(this, selector);
  } as typeof HTMLElement.prototype.matches;
}

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
}
