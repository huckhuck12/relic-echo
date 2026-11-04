using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Collections.Generic;

// Offline only. The three generated 5x3 sheets have been visually inspected.
// Reuse vacant 64px cells below the body, excluding the existing weapon rectangles.
public static class EquipmentAtlasBuilder {
    class Frame { public Bitmap Image; public Rectangle Bounds; public int Pixels; }
    static bool Chroma(Color p) {
        return (p.R > 170 && p.B > 140 && p.G < Math.Min(p.R,p.B)*.65)
            || (p.R > 190 && p.G < 90 && p.B < 110);
    }
    static bool EdgeKey(Color p) { return Chroma(p) || (p.R > 205 && p.G > 195 && p.B < 95); }
    static Frame Extract(Bitmap source,int col,int row,bool wide) {
        // Inspected sheets have generous horizontal gutters but the thorn tips cross nominal columns.
        int gutter=wide&&row==2&&col==0?14:0;
        int x0=col*source.Width/5-(wide&&row==2&&col==4?14:0),y0=row*source.Height/3-(wide&&row==2?12:0);
        int w=Math.Min(source.Width,(col+1)*source.Width/5+gutter)-x0,h=(row+1)*source.Height/3-y0;
        var pixels=new Color[w*h];var seen=new bool[w*h];var outside=new bool[w*h];var flood=new Queue<int>();
        for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
            int n=y*w+x;pixels[n]=source.GetPixel(x+x0,y+y0);
            if((x==0||y==0||x==w-1||y==h-1)&&(pixels[n].A<32||EdgeKey(pixels[n]))) {outside[n]=true;flood.Enqueue(n);}
        }
        while(flood.Count>0) {
            int n=flood.Dequeue(),nx=n%w,ny=n/w;
            for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++) {
                int xx=nx+dx,yy=ny+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;int next=yy*w+xx;
                if(!outside[next]&&(pixels[next].A<32||EdgeKey(pixels[next]))) {outside[next]=true;flood.Enqueue(next);}
            }
        }
        for(int n=0;n<pixels.Length;n++)if(pixels[n].A<32||Chroma(pixels[n])||(outside[n]&&EdgeKey(pixels[n])))pixels[n]=Color.Transparent;
        var pieces=new List<List<int>>();int largest=0;
        for(int i=0;i<pixels.Length;i++) {
            if(seen[i]||pixels[i].A==0)continue;
            var piece=new List<int>();var queue=new Queue<int>();queue.Enqueue(i);seen[i]=true;
            while(queue.Count>0) {
                int n=queue.Dequeue(),nx=n%w,ny=n/w;piece.Add(n);
                for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++) {
                    int xx=nx+dx,yy=ny+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;int next=yy*w+xx;
                    if(!seen[next]&&pixels[next].A>0){seen[next]=true;queue.Enqueue(next);}
                }
            }
            largest=Math.Max(largest,piece.Count);pieces.Add(piece);
        }
        var image=new Bitmap(w,h,PixelFormat.Format32bppArgb);int left=w,top=h,right=0,bottom=0,kept=0;
        foreach(var piece in pieces)if(piece.Count>=Math.Max(40,largest/120))foreach(int n in piece) {
            int x=n%w,y=n/w;image.SetPixel(x,y,pixels[n]);kept++;left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x+1);bottom=Math.Max(bottom,y+1);
        }
        if(kept<1200||left<2||top<2||right>w-2||bottom>h-2)throw new Exception("Invalid equipment cell "+row+":"+col+" bounds "+left+","+top+","+right+","+bottom);
        return new Frame{Image=image,Bounds=Rectangle.FromLTRB(left,top,right,bottom),Pixels=kept};
    }
    public static void Pack(string root,Bitmap atlas) {
        string input=Path.Combine(root,"output/imagegen"),output=Path.Combine(root,"assets/hero");
        string[] families={"head","armor","back"};
        string[][] ids={new[]{"helmet","hood","visor"},new[]{"light","heavy","energy"},new[]{"cape","pack","thorn"}};
        var slots=new List<Point>();
        var weapons=new[]{new Rectangle(640,800,21,96),new Rectangle(768,800,50,48),new Rectangle(896,800,30,42)};
        using(var g=Graphics.FromImage(atlas)) {
            g.CompositingMode=CompositingMode.SourceCopy;
            for(int y=768;y<1024;y+=64)for(int x=0;x<1024;x+=64) {
                var cell=new Rectangle(x,y,64,64);bool blocked=false;
                foreach(var weapon in weapons)if(cell.IntersectsWith(weapon))blocked=true;
                if(blocked)continue;slots.Add(new Point(x,y));g.FillRectangle(Brushes.Transparent,cell);
            }
        }
        var frameRows=new List<string>();var meta=new List<string>();int index=0;
        for(int family=0;family<3;family++)using(var source=new Bitmap(Path.Combine(input,"hero-equipment-"+families[family]+"-source.png"))) {
            for(int row=0;row<3;row++) {
                var frames=new Frame[5];float scale=float.MaxValue;
                for(int col=0;col<5;col++) {
                    try { frames[col]=Extract(source,col,row,family==2); } catch(Exception e) {throw new Exception(families[family]+": "+e.Message);}
                    scale=Math.Min(scale,Math.Min(60f/frames[col].Bounds.Width,60f/frames[col].Bounds.Height));
                }
                var crops=new List<string>();
                for(int col=0;col<5;col++) {
                    var f=frames[col];var slot=slots[index++];float dw=f.Bounds.Width*scale,dh=f.Bounds.Height*scale;
                    int x=slot.X+(int)Math.Floor((64-dw)/2),y=slot.Y+(int)Math.Floor((64-dh)/2),w=(int)Math.Ceiling(dw),h=(int)Math.Ceiling(dh);
                    using(var g=Graphics.FromImage(atlas)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.DrawImage(f.Image,new Rectangle(x,y,w,h),f.Bounds,GraphicsUnit.Pixel);}
                    // The chroma fringe is only removed from translucent edge pixels after resampling.
                    for(int yy=y;yy<y+h;yy++)for(int xx=x;xx<x+w;xx++){var p=atlas.GetPixel(xx,yy);if(Chroma(p)||(p.A<180&&EdgeKey(p)))atlas.SetPixel(xx,yy,Color.Transparent);}
                    crops.Add("{ sx: "+x+", sy: "+y+", sw: "+w+", sh: "+h+" }");
                    meta.Add("{\"id\":\""+ids[family][row]+"\",\"view\":"+col+",\"sx\":"+x+",\"sy\":"+y+",\"sw\":"+w+",\"sh\":"+h+",\"sourcePixels\":"+f.Pixels+"}");f.Image.Dispose();
                }
                frameRows.Add("    "+ids[family][row]+": ["+string.Join(", ",crops)+"]");
            }
        }
        long transparent=0,opaque=0,bad=0;
        foreach(var slot in slots)for(int y=slot.Y;y<slot.Y+64;y++)for(int x=slot.X;x<slot.X+64;x++){var p=atlas.GetPixel(x,y);if(p.A==0)transparent++;if(p.A>=240)opaque++;if(p.A>24&&Chroma(p))bad++;}
        if(opaque<30000||transparent<50000||bad!=0)throw new Exception("Equipment alpha/key validation failed "+transparent+","+opaque+","+bad);
        File.WriteAllText(Path.Combine(root,"src/rendering/equipment-art-frames.ts"),"// Generated by scripts/build-equipment-art.ps1. Five views: front, quarter, side, back-quarter, back.\nexport const EQUIPMENT_ART_FRAMES = {\n"+string.Join(",\n",frameRows)+"\n} as const;\n");
        File.WriteAllText(Path.Combine(output,"equipment.json"),"{\"source\":\"ruin-apprentice.png\",\"width\":1024,\"height\":1024,\"views\":[\"front\",\"front-right\",\"right\",\"back-right\",\"back\"],\"frames\":["+string.Join(",",meta)+"],\"qa\":{\"transparentPixels\":"+transparent+",\"opaquePixels\":"+opaque+",\"keyPixels\":"+bad+"}}\n");
        long allTransparent=0,allOpaque=0,allBad=bad;
        for(int y=0;y<1024;y++)for(int x=0;x<1024;x++){
            var p=atlas.GetPixel(x,y);if(p.A==0)allTransparent++;if(p.A>=240)allOpaque++;
            // Body colors use their original approved key thresholds; warm skin is not equipment chroma.
            bool bodyKey=(p.R>200&&p.G<70&&p.B<90)||(p.R>210&&p.G>210&&p.B<65)||(p.R>180&&p.B>170&&p.G<100);
            if(y<768&&p.A>24&&bodyKey)allBad++;
        }
        string bodyMetaPath=Path.Combine(output,"ruin-apprentice.json");
        string bodyMeta=File.ReadAllText(bodyMetaPath);
        bodyMeta=System.Text.RegularExpressions.Regex.Replace(bodyMeta,"\"qa\":\\{[^}]+\\}","\"qa\":{\"transparentPixels\":"+allTransparent+",\"opaquePixels\":"+allOpaque+",\"keyPixels\":"+allBad+"}");
        File.WriteAllText(bodyMetaPath,bodyMeta);
        using(var preview=new Bitmap(1024,1024))using(var g=Graphics.FromImage(preview)){g.Clear(Color.FromArgb(82,107,80));g.DrawImageUnscaled(atlas,0,0);preview.Save(Path.Combine(input,"hero-equipment-atlas-preview.png"),ImageFormat.Png);}
    }
    public static void Build(string root) {
        string path=Path.Combine(root,"assets/hero/ruin-apprentice.png");
        using(var original=new Bitmap(path))using(var atlas=new Bitmap(original)){Pack(root,atlas);original.Dispose();atlas.Save(path,ImageFormat.Png);}
    }
}
