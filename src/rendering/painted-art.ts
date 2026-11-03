import type { Shape } from './voxel.js';
/** Authored silhouettes, not runtime noise: tiny asymmetries survive rasterization. */
export function oval(x: number, y: number, rx: number, ry: number, fill: string, ink = '#34443e'): Shape {
    const p: number[] = [];
    for (let i = 0; i < 20; i++) {
        const a = i * Math.PI / 10, r = 1 + Math.sin(i * 2.3) * .025;
        p.push(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r);
    }
    return {
        type: 'poly', p, fill, line: ink, width: 1.1
    };
}
export function polygon(p: number[], fill: string, part?: Shape['part']): Shape {
    return {
        type: 'poly', p, fill, line: '#34443e', width: 1.1, part
    };
}
/** Soft, bevelled cloth/metal pieces keep the existing equipment and weapon anchors. */
export function paintedBlock(x: number, y: number, w: number, h: number, d: number, color: string): Shape[] {
    const r = Math.min(4, w * .22, h * .22), top = y - h;
    return [
        polygon([x + r, top, x + w - r, top - d * .25, x + w + d * .4, top + r, x + w + d * .4, y - r, x + w - r, y, x + r, y, x, y - r, x, top + r], color),
        { type: 'poly', p: [x + r, top + 2, x + w - r, top + 1 - d * .25, x + w - r, top + 4, x + r, top + 5], fill: tint(color, 1.15) },
        { type: 'poly', p: [x + w - 3, top + r, x + w + d * .4, top + r, x + w + d * .4, y - r, x + w - 3, y - 1], fill: tint(color, .8) },
    ];
}
export function paintedEnemy(kind: number, flash: boolean, detail: boolean): Shape[] {
    const s: Shape[] = [oval(0, 2, kind >= 3 ? 34 : 24, 7, '#3d5848', '#3d5848')];
    const c = (color: string) => flash ? '#fff5dc' : color;
    const add = (shape: Shape, part?: Shape['part']) => {
        if (part)
            shape.part = part;
        s.push(shape);
    };
    if (kind === 0) {
        add(polygon([-22, -7, -23, -16, -19, -25, -9, -30, 5, -28, 16, -23, 22, -13, 21, -5, 13, 0, -11, 1], c('#8dac70')));
        add(oval(-5, -22, 11, 5, c('#bed09a'), '#bed09a'));
        add(polygon([-2, -28, -9, -38, -1, -37, 3, -29, 11, -39, 16, -37, 6, -27], c('#567a53')));
        add(oval(-8, -14, 2.2, 3.2, '#2a403b'));
        add(oval(7, -14, 2.2, 3.2, '#2a403b'));
        add(polygon([-3, -7, 0, -5, 5, -7], '#435a42'));
        if (detail) {
            add(oval(-13, -8, 4, 1.6, '#c3b08a', '#c3b08a'));
            add(oval(12, -8, 3, 1.4, '#c3b08a', '#c3b08a'));
        }
    }
    else if (kind === 1) {
        add(polygon([-12, -3, -9, -34, 0, -40, 10, -34, 15, -2, 4, 1, -3, -2], c('#897b9e')));
        add(polygon([-10, -32, -18, -22, -17, -12, -11, -12, -6, -27], c('#756787'), 'leftArm'));
        add(polygon([13, -39, 20, -36, 20, -22, 13, -22], c('#756787'), 'rightArm'));
        add(oval(0, -46, 14, 13, c('#e6d6ad')));
        add(polygon([-17, -45, -13, -59, 0, -65, 15, -58, 17, -44, 10, -52, -10, -52], c('#756787')));
        add(oval(-6, -46, 3, 4, '#394047'));
        add(oval(6, -46, 3, 4, '#394047'));
        add(polygon([-4, -36, 0, -38, 5, -36], '#766c70'));
        add(polygon([20, -3, 19, -45, 23, -46, 25, -4], c('#7b6555'), 'staff'));
        add(polygon([22, -59, 30, -50, 24, -41, 15, -49], c('#bca6d5'), 'staff'));
        add(polygon([22, -54, 25, -50, 22, -46, 19, -50], '#f5e9cb', 'staff'));
        if (detail) {
            add(polygon([-4, -28, 0, -19, 4, -28], '#cabb91'));
            add(polygon([-7, -8, 0, -11, 9, -6], '#b9a5bb'));
        }
    }
    else if (kind === 2) {
        add(polygon([-23, 0, -22, -16, -14, -17, -13, -1], c('#665141')));
        add(polygon([11, 0, 10, -17, 20, -15, 22, -1], c('#665141')));
        add(oval(0, -23, 26, 20, c('#bb8d65')));
        add(polygon([-21, -33, -25, -49, -12, -42, 0, -48, 12, -42, 25, -47, 21, -31], c('#77604b')));
        add(oval(0, -19, 12, 8, c('#d2a187')));
        add(oval(-5, -19, 2, 3, '#6b534b'));
        add(oval(5, -19, 2, 3, '#6b534b'));
        add(polygon([-17, -14, -23, -20, -21, -30, -16, -23, -11, -19], '#f0dfb6'));
        add(polygon([17, -14, 23, -20, 21, -30, 16, -23, 11, -19], '#f0dfb6'));
        add(oval(-13, -32, 3, 2, '#302f31'));
        add(oval(13, -32, 3, 2, '#302f31'));
        if (detail)
            add(polygon([-7, -40, -2, -44, 4, -39, 9, -42, 5, -33, -3, -34], c('#d5b17b')));
    }
    else {
        const b = kind === 4 ? 1.6 : 1;
        const part = (p: number[], color: string, tag?: Shape['part']) => add(polygon(p.map(v => v * b), c(color)), tag);
        part([-24, 0, -24, -25, -9, -27, -7, -1], '#67786b');
        part([8, 0, 9, -27, 24, -25, 25, -1], '#67786b');
        part([-27, -21, -31, -49, -17, -60, 19, -59, 29, -47, 26, -20], kind === 4 ? '#9b8970' : '#91a087');
        part([-20, -58, -23, -76, -11, -84, 15, -82, 23, -70, 17, -55], '#b4b79a');
        part([-38, -25, -41, -49, -31, -58, -25, -51, -26, -27], '#778b75', 'leftArm');
        part([27, -26, 26, -51, 34, -57, 42, -48, 40, -24], '#778b75', 'rightArm');
        part([-14, -72, -5, -70, -7, -66, -15, -67], '#f4d58b');
        part([6, -70, 15, -72, 15, -67, 8, -66], '#f4d58b');
        part([0, -50, 12, -38, 0, -25, -11, -38], '#e7be7a');
        part([0, -45, 5, -38, 0, -32, -5, -38], '#fff0c5');
        if (true) {
            part([-20, -48, -10, -44, -15, -34, -9, -25], '#617768');
            part([12, -58, 10, -49, 19, -47], '#647969');
        }
        if (kind === 4) {
            part([-22, -77, -29, -99, -14, -93, -8, -81], '#c9aa76');
            part([12, -82, 19, -95, 29, -99, 24, -77], '#c9aa76');
        }
    }
    return s;
}
function tint(color: string, factor: number): string {
    const n = parseInt(color.slice(1), 16);
    return '#' + [16, 8, 0].map(shift => Math.min(255, Math.round(((n >> shift) & 255) * factor)).toString(16).padStart(2, '0')).join('');
}
