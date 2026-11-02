import type { LayaRuntime } from '../../src/platform/laya.js';
import { setupLayaStub } from '../helpers/laya-stub.mjs';

const runtime: LayaRuntime = setupLayaStub();
const sprite = new runtime.Sprite();
const text = sprite.addChild(new runtime.Text());
text.fontSize = 18;
sprite.getChildAt(0)?.removeSelf();
// @ts-expect-error Laya 2 exposes numChildren/getChildAt, not children.
sprite.children[0];
// @ts-expect-error Public API spelling errors must not become any.
sprite.getChild(0);
