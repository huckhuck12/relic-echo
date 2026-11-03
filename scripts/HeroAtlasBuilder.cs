using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Collections.Generic;

// Offline normalization only. Generated source grids are inspected before running this tool.
public static class HeroAtlasBuilder {
    class Frame { public Bitmap Image; public Rectangle Bounds; public float FootX; }
    static bool Key(Color p) {
        return (p.R > 200 && p.G < 70 && p.B < 90)
            || (p.R > 210 && p.G > 210 && p.B < 65)
            || (p.R > 180 && p.B > 170 && p.G < 100);
    }
    static Frame Extract(Bitmap source, int col, int row, int cols) {
        int x0 = col * source.Width / cols, y0 = row * source.Height / 5;
        int w = (col + 1) * source.Width / cols - x0, h = (row + 1) * source.Height / 5 - y0;
        var pixels = new Color[w * h]; var seen = new bool[w * h];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            var p = source.GetPixel(x0 + x, y0 + y);
            pixels[y * w + x] = p.A < 24 || Key(p) ? Color.Transparent : p;
        }
        // Keep the character component, discarding detached chroma-key fragments.
        var best = new List<int>();
        for (int i = 0; i < pixels.Length; i++) {
            if (seen[i] || pixels[i].A == 0) continue;
            var component = new List<int>(); var queue = new Queue<int>();
            queue.Enqueue(i); seen[i] = true;
            while (queue.Count > 0) {
                int n = queue.Dequeue(), nx = n % w, ny = n / w; component.Add(n);
                for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                    int xx = nx + dx, yy = ny + dy;
                    if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
                    int next = yy * w + xx;
                    if (!seen[next] && pixels[next].A > 0) { seen[next] = true; queue.Enqueue(next); }
                }
            }
            if (component.Count > best.Count) best = component;
        }
        if (best.Count < 1000) throw new Exception("Missing character: " + row + ":" + col);
        var image = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        int left = w, top = h, right = 0, bottom = 0;
        foreach (int n in best) {
            int x = n % w, y = n / w;
            image.SetPixel(x, y, pixels[n]);
            left = Math.Min(left, x); right = Math.Max(right, x);
            top = Math.Min(top, y); bottom = Math.Max(bottom, y);
        }
        if (left < 2 || top < 2 || right >= w - 2 || bottom >= h - 2)
            throw new Exception("Character touches cell boundary: " + row + ":" + col);
        int footLeft = w, footRight = 0;
        foreach (int n in best) if (n / w > bottom - (bottom - top) * .10) {
            footLeft = Math.Min(footLeft, n % w); footRight = Math.Max(footRight, n % w);
        }
        return new Frame { Image = image, Bounds = Rectangle.FromLTRB(left, top, right + 1, bottom + 1), FootX = (footLeft + footRight) / 2f };
    }
    public static void Build(string root) {
        string input = Path.Combine(root, "output/imagegen"), output = Path.Combine(root, "assets/hero");
        Directory.CreateDirectory(output);
        var frames = new Frame[5,7]; var scales = new float[5,2];
        var report = new List<string>();
        for (int action = 0; action < 2; action++) {
            int cols = action == 0 ? 4 : 3;
            using (var src = new Bitmap(Path.Combine(input, action == 0 ? "hero-b-walk-source.png" : "hero-b-cast-source.png"))) {
                for (int row = 0; row < 5; row++) {
                    float height = 0;
                    for (int col = 0; col < cols; col++) {
                        var f = Extract(src, col, row, cols); frames[row,col + (action == 0 ? 0 : 4)] = f;
                        height += f.Bounds.Height;
                    }
                    scales[row,action] = 120f / (height / cols);
                }
            }
        }
        int[] rows = {0,1,2,1,0,4,3,4};
        using (var atlas = new Bitmap(1024, 1024, PixelFormat.Format32bppArgb)) {
            using (var g = Graphics.FromImage(atlas)) {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                for (int dir = 0; dir < 8; dir++) for (int pose = 0; pose < 7; pose++) {
                    var f = frames[rows[dir],pose]; float scale = scales[rows[dir],pose < 4 ? 0 : 1];
                    int index = dir * 7 + pose, tx = index % 10 * 96, ty = index / 10 * 128;
                    bool mirror = dir == 3 || dir == 4 || dir == 5;
                    float left = 48 + (f.Bounds.Left - f.FootX) * scale;
                    float right = left + f.Bounds.Width * scale;
                    float top = 124 - f.Bounds.Height * scale;
                    if (left < 2 || right > 94 || top < 1) throw new Exception("Atlas padding exceeded: " + index);
                    var state = g.Save(); g.SetClip(new Rectangle(tx, ty, 96,128));
                    if (mirror) { g.TranslateTransform(tx + 96, ty); g.ScaleTransform(-1,1); }
                    else g.TranslateTransform(tx,ty);
                    g.DrawImage(f.Image, new RectangleF(left,top,f.Bounds.Width*scale,f.Bounds.Height*scale), f.Bounds, GraphicsUnit.Pixel);
                    g.Restore(state);
                    report.Add("{\"direction\":" + dir + ",\"pose\":" + pose + ",\"x\":" + tx + ",\"y\":" + ty + ",\"mirrored\":" + mirror.ToString().ToLowerInvariant() + "}");
                }
            }
            atlas.Save(Path.Combine(output,"ruin-apprentice.png"),ImageFormat.Png);
            // Inspect both dark grass and pale backgrounds; final runtime does not use this board.
            using (var preview = new Bitmap(1024,1024)) using (var g = Graphics.FromImage(preview)) {
                g.Clear(Color.FromArgb(76,102,75)); g.DrawImageUnscaled(atlas,0,0);
                preview.Save(Path.Combine(input,"hero-b-atlas-preview.png"),ImageFormat.Png);
            }
            long transparent = 0, opaque = 0, bad = 0;
            for (int y=0;y<1024;y++) for(int x=0;x<1024;x++) {
                var p=atlas.GetPixel(x,y); if(p.A==0)transparent++; if(p.A>=240)opaque++; if(p.A>24&&Key(p))bad++;
            }
            if(transparent<500000||opaque<50000||bad!=0)throw new Exception("Alpha/color validation failed: transparent="+transparent+", opaque="+opaque+", key="+bad);
            File.WriteAllText(Path.Combine(output,"ruin-apprentice.json"),
                "{\"width\":1024,\"height\":1024,\"cell\":[96,128],\"pivot\":[48,124],\"scale\":1.5,\"frames\":["+string.Join(",",report)+"],\"qa\":{\"transparentPixels\":"+transparent+",\"opaquePixels\":"+opaque+",\"keyPixels\":"+bad+"}}\n");
        }
        foreach(var f in frames)f.Image.Dispose();
    }
}
