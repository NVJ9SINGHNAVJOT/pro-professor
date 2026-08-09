import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import type { SidebarRowAction } from "@/components/common/sidebar";
import { cn } from "@/lib/utils";

/* ── Which row's menu is open ─────────────────────────────────────────────────
 * The app shows **one** row menu at a time, so the open menu is a single
 * module-level value rather than per-row state. Rows that share it live in
 * different trees — three sidebars and the explorer grid — with no common
 * provider, and one value means opening a menu closes any other outright
 * instead of two rows negotiating it between them.
 */

interface OpenMenu {
  rowId: string;
  label: string;
  actions: SidebarRowAction[];
  x: number;
  y: number;
}

let openMenu: OpenMenu | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getOpenMenu = () => openMenu;

/** Opens at the cursor. The last row right-clicked always wins. */
const openAt = (menu: OpenMenu) => {
  openMenu = menu;
  emit();
};

/** Closes, optionally only if `rowId` is still the row holding the menu. */
const closeMenu = (rowId?: string) => {
  if (openMenu === null) return;
  if (rowId !== undefined && openMenu.rowId !== rowId) return;
  openMenu = null;
  emit();
};

/** Roughly one row of the menu, used only to keep the panel inside the viewport before it renders. */
const ESTIMATED_ITEM_HEIGHT = 32;
const VIEWPORT_MARGIN = 8;

interface SidebarRowMenuProps {
  /** Named for screen readers: "Actions for My Diagram". */
  label: string;
  actions: SidebarRowAction[];
  /** Suppresses the menu while the row is in another mode — a folder being renamed inline. */
  disabled?: boolean;
  /**
   * The row this menu belongs to. Right-clicking anywhere on it opens the menu.
   *
   * A single element, which is cloned to attach the handler — the row stays the element it already
   * is (a link, a button, a draggable div) rather than gaining a wrapper that would break the
   * list's layout.
   */
  children: ReactElement<{ onContextMenu?: (e: React.MouseEvent) => void; "data-state"?: string }>;
}

/**
 * A row's actions, on right-click — used by the chat, note and diagram sidebars and by the
 * explorer grid's cards and background.
 *
 * Wraps the row rather than sitting beside it: with no `⋯` button there is nothing to reveal on
 * hover, nothing to reserve a lane for, and no button nested inside the row's own link — the whole
 * row is the target. See `sidebar.ts` for the layout contract.
 *
 * The menu never takes focus, so an action that opens a field (Rename) keeps it.
 */
const SidebarRowMenu = ({ label, actions, disabled, children }: SidebarRowMenuProps) => {
  const rowId = useId();
  const menu = useSyncExternalStore(subscribe, getOpenMenu, getOpenMenu);
  const isOpen = menu !== null && menu.rowId === rowId;

  // A row can be deleted, or swapped for a rename field, while its own menu is open.
  useEffect(() => () => closeMenu(rowId), [rowId]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled === true) return;
      e.preventDefault();
      // A card sits inside a pane that has its own background menu; the innermost row claims the
      // gesture, as a file explorer does.
      e.stopPropagation();
      openAt({ rowId, label, actions, x: e.clientX, y: e.clientY });
    },
    [disabled, rowId, label, actions],
  );

  const row = cloneElement(children, {
    onContextMenu: handleContextMenu,
    // `sidebarRow` holds the row's hover fill while its menu is open, via `group-data-[state=open]`.
    "data-state": isOpen ? "open" : "closed",
  });

  return (
    <>
      {row}
      {isOpen && menu !== null && <MenuPanel menu={menu} />}
    </>
  );
};

/** The floating panel. Rendered by whichever row owns the open menu, portalled out of the list. */
const MenuPanel = ({ menu }: { menu: OpenMenu }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(() => ({
    left: menu.x,
    top: menu.y,
    // Guessed until measured, so a menu opened near the bottom edge doesn't paint off-screen for a
    // frame and then jump.
    ready: false,
  }));

  // Flip/clamp into the viewport once the real size is known — before paint, so it never jumps.
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const { width, height } = node.getBoundingClientRect();
    const left =
      menu.x + width > window.innerWidth - VIEWPORT_MARGIN ? Math.max(VIEWPORT_MARGIN, menu.x - width) : menu.x;
    const top =
      menu.y + height > window.innerHeight - VIEWPORT_MARGIN ? Math.max(VIEWPORT_MARGIN, menu.y - height) : menu.y;
    setPos({ left, top, ready: true });
  }, [menu]);

  useEffect(() => {
    // Capture phase, and `pointerdown` rather than `click`: the menu must be gone before the
    // element underneath reacts, and a right-click elsewhere never produces a `click` at all.
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) === true) return;
      closeMenu(menu.rowId);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(menu.rowId);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((current) => {
          const step = e.key === "ArrowDown" ? 1 : -1;
          return (current + step + menu.actions.length) % menu.actions.length;
        });
        return;
      }
      if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        const action = menu.actions[active];
        closeMenu(menu.rowId);
        action.onSelect();
      }
    };
    // Any layout change moves the row out from under a menu anchored to a fixed point.
    const onDisplace = () => closeMenu(menu.rowId);

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onDisplace);
    window.addEventListener("blur", onDisplace);
    document.addEventListener("scroll", onDisplace, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onDisplace);
      window.removeEventListener("blur", onDisplace);
      document.removeEventListener("scroll", onDisplace, true);
    };
  }, [menu, active]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${menu.label}`}
      style={{
        left: pos.left,
        top: pos.top,
        minHeight: menu.actions.length * ESTIMATED_ITEM_HEIGHT,
        visibility: pos.ready ? "visible" : "hidden",
      }}
      className="fixed z-50 w-auto min-w-40 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      {menu.actions.map((action, index) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          onClick={() => {
            closeMenu(menu.rowId);
            action.onSelect();
          }}
          onMouseEnter={() => setActive(index)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left para-small-medium transition-colors",
            action.destructive === true ? "text-destructive" : "text-popover-foreground",
            index === active &&
              (action.destructive === true ? "bg-destructive/10" : "bg-accent text-accent-foreground"),
          )}
        >
          <action.icon className="size-4 shrink-0" />
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  );
};

export default SidebarRowMenu;
