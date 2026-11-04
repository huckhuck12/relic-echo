/** Project-used public API of the bundled Laya 2 engine. No private node fields or index signature. */
export interface LayaPoint {
    x: number;
    y: number;
}
export interface LayaEvent {
    target: LayaSprite;
    touchId?: number;
    nativeEvent?: Event;
    stopPropagation(): void;
}
export interface LayaGraphics {
    clear(): void;
    drawTexture?(texture: LayaTexture, x: number, y: number, width: number, height: number, matrix?: LayaMatrix, alpha?: number): void;
    drawRect(x: number, y: number, width: number, height: number, fill: string | null, line?: string | null, lineWidth?: number): void;
    drawCircle(x: number, y: number, radius: number, fill: string | null, line?: string | null, lineWidth?: number): void;
    drawPoly(x: number, y: number, points: number[], fill: string | null, line?: string | null, lineWidth?: number): void;
    drawLine(x: number, y: number, tx: number, ty: number, color: string, width?: number): void;
    drawLines(x: number, y: number, points: number[], color: string, width?: number): void;
}
export interface LayaMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}
export interface LayaSprite {
    name: string;
    readonly destroyed: boolean;
    readonly parent: LayaSprite | null;
    readonly numChildren: number;
    readonly graphics: LayaGraphics;
    x: number;
    y: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    pivotX: number;
    pivotY: number;
    rotation: number;
    alpha: number;
    zOrder: number;
    visible: boolean;
    mouseEnabled: boolean;
    mouseThrough: boolean;
    pos(x: number, y: number): this;
    size(width: number, height: number): this;
    scale(x: number, y: number): this;
    pivot(x: number, y: number): this;
    addChild<T extends LayaSprite>(node: T): T;
    getChildAt(index: number): LayaSprite | null;
    getChildByName(name: string): LayaSprite | null;
    removeSelf(): this;
    destroyChildren(): void;
    destroy(): void;
    on(type: string, caller: object, listener: (event: LayaEvent) => void): this;
    localToGlobal(point: LayaPoint): LayaPoint;
}
export interface LayaText extends LayaSprite {
    text: string;
    font: string;
    fontSize: number;
    color: string;
    wordWrap: boolean;
    leading: number;
    align: string;
    bold: boolean;
    stroke: number;
    strokeColor: string;
    overflow: string;
}
export interface LayaStage extends LayaSprite {
    bgColor: string;
    scaleMode: string;
    useRetinalCanvas: boolean;
    readonly mouseX: number;
    readonly mouseY: number;
    render?(context: unknown, x: number, y: number): void;
}
export interface LayaTexture {
    destroy(destroyBitmap?: boolean): void;
}
export interface LayaTextureBitmap {
    lock: boolean;
    loadImageSource(source: HTMLCanvasElement | HTMLImageElement, premultiplyAlpha?: boolean): void;
    destroy(): void;
}
export interface LayaRuntime {
    Browser?: {
        createElement(type: 'canvas'): HTMLCanvasElement;
        createElement(type: 'img'): HTMLImageElement;
    };
    Texture2D?: new (width: number, height: number, format: number, mipmap: boolean) => LayaTextureBitmap;
    Matrix?: new (a: number, b: number, c: number, d: number, tx: number, ty: number) => LayaMatrix;
    Texture?: {
        new (bitmap: LayaTextureBitmap): LayaTexture;
        createFromTexture(texture: LayaTexture, x: number, y: number, width: number, height: number): LayaTexture;
    };
    Stat?: {
        renderBatches: number;
        trianglesFaces: number;
    };
    Sprite: new () => LayaSprite;
    Text: new () => LayaText;
    Point: new (x: number, y: number) => LayaPoint;
    Event: Record<'MOUSE_DOWN' | 'MOUSE_MOVE' | 'MOUSE_UP' | 'MOUSE_OUT' | 'CLICK' | 'RESIZE' | 'KEY_DOWN' | 'KEY_UP', string>;
    WebGL: object;
    stage: LayaStage;
    init(width: number, height: number, renderer: object): void;
    timer: {
        frameLoop(interval: number, caller: object, method: () => void): void;
    };
}
declare global {
    const Laya: LayaRuntime;
}
