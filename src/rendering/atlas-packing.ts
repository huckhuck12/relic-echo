interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** MaxRects packing, used only when rebuilding a painted atlas. Frames are never rotated. */
export function packAtlas(sizes: {
    w: number;
    h: number;
}[], width: number, height: number): {
    x: number;
    y: number;
}[] | null {
    if (sizes.some(s => s.w <= 0 || s.h <= 0 || s.w > width || s.h > height) || sizes.reduce((area, s) => area + s.w * s.h, 0) > width * height)
        return null;
    let free: Rect[] = [{ x: 0, y: 0, w: width, h: height }];
    const result: {
        x: number;
        y: number;
    }[] = [];
    const order = sizes.map((size, index) => ({ ...size, index })).sort((a, b) => b.w * b.h - a.w * a.h);
    for (const size of order) {
        let best: Rect | undefined, short = Infinity, long = Infinity;
        for (const rect of free) {
            if (size.w > rect.w || size.h > rect.h)
                continue;
            const a = Math.min(rect.w - size.w, rect.h - size.h), b = Math.max(rect.w - size.w, rect.h - size.h);
            if (a < short || a === short && b < long) {
                best = rect;
                short = a;
                long = b;
            }
        }
        if (!best)
            return null;
        const placed = { x: best.x, y: best.y, w: size.w, h: size.h };
        result[size.index] = { x: placed.x, y: placed.y };
        const next: Rect[] = [];
        for (const rect of free) {
            if (placed.x >= rect.x + rect.w || placed.x + placed.w <= rect.x || placed.y >= rect.y + rect.h || placed.y + placed.h <= rect.y) {
                next.push(rect);
                continue;
            }
            if (placed.x > rect.x)
                next.push({ ...rect, w: placed.x - rect.x });
            if (placed.x + placed.w < rect.x + rect.w)
                next.push({ ...rect, x: placed.x + placed.w, w: rect.x + rect.w - placed.x - placed.w });
            if (placed.y > rect.y)
                next.push({ ...rect, h: placed.y - rect.y });
            if (placed.y + placed.h < rect.y + rect.h)
                next.push({ ...rect, y: placed.y + placed.h, h: rect.y + rect.h - placed.y - placed.h });
        }
        free = next.filter((rect, i) => !next.some((other, j) => j !== i && (j < i || rect.x !== other.x || rect.y !== other.y || rect.w !== other.w || rect.h !== other.h) && rect.x >= other.x && rect.y >= other.y && rect.x + rect.w <= other.x + other.w && rect.y + rect.h <= other.y + other.h));
    }
    return result;
}
