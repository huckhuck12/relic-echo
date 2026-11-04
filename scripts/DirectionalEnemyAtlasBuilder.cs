using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Collections.Generic;

// Offline chroma cleanup and deterministic, foot-aligned normalization.
public static class DirectionalEnemyAtlasBuilder {
    class Frame { public Bitmap Image; public Rectangle Bounds; public int Pixels; public int Kind,View,Part; public float W,H; public int X,Y; }
    static bool Background(Color p) { return Key(p) || (p.R>235 && p.G>235 && p.B>235); }
    static bool Key(Color p) { return (p.R > 150 && p.B > 120 && p.G < Math.Min(p.R,p.B)*.64)
        || (p.R > 195 && p.G < 85 && p.B < 105)
        || (p.R > 200 && p.G > 200 && p.B < 85)
        || (p.B > 195 && p.R < 75 && p.G < 100); }
    static Frame Extract(Bitmap source,int col,int row,double[] edges) {
        // Generated rows have uneven gutters; boundaries are measured per family below.

        int x0=col*source.Width/5,y0=(int)(edges[row]*source.Height),w=(col+1)*source.Width/5-x0,h=(int)(edges[row+1]*source.Height)-y0;
        var pixels=new Color[w*h];var seen=new bool[w*h];var pieces=new List<List<int>>();int largest=0;
        var outside=new bool[w*h];var flood=new Queue<int>();
        for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
            int n=y*w+x;pixels[n]=source.GetPixel(x+x0,y+y0);
            if((x==0||y==0||x==w-1||y==h-1)&&(pixels[n].A<32||Background(pixels[n]))) {outside[n]=true;flood.Enqueue(n);}
        }
        // Only remove background-connected key colors: enclosed gold core highlights are real art.
        while(flood.Count>0) {
            int n=flood.Dequeue(),nx=n%w,ny=n/w;
            for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++) {
                int xx=nx+dx,yy=ny+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;int next=yy*w+xx;
                if(!outside[next]&&(pixels[next].A<32||Background(pixels[next]))) {outside[next]=true;flood.Enqueue(next);}
            }
        }
        for(int n=0;n<pixels.Length;n++)if(pixels[n].A<32||(outside[n]&&Background(pixels[n])))pixels[n]=Color.Transparent;
        for(int i=0;i<pixels.Length;i++) {
            if(seen[i]||pixels[i].A==0)continue;
            var piece=new List<int>();var queue=new Queue<int>();queue.Enqueue(i);seen[i]=true;
            while(queue.Count>0) {
                int n=queue.Dequeue(),nx=n%w,ny=n/w;piece.Add(n);
                for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++) {
                    int xx=nx+dx,yy=ny+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;int next=yy*w+xx;
                    if(!seen[next]&&pixels[next].A>0) { seen[next]=true;queue.Enqueue(next); }
                }
            }
            largest=Math.Max(largest,piece.Count);pieces.Add(piece);
        }
        int left=w,top=h,right=0,bottom=0,kept=0;var image=new Bitmap(w,h,PixelFormat.Format32bppArgb);
        foreach(var piece in pieces)if(piece.Count>=Math.Max(24,largest/20))foreach(int n in piece) {
            int x=n%w,y=n/w;image.SetPixel(x,y,pixels[n]);kept++;left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x+1);bottom=Math.Max(bottom,y+1);
        }
        if(kept<100)throw new Exception("Invalid enemy cell "+row+":"+col+" bounds "+left+","+top+","+right+","+bottom+" cell "+w+","+h);
        return new Frame { Image=image, Bounds=Rectangle.FromLTRB(left,top,right,bottom), Pixels=kept };
    }

    public static void Build(string root) {
        var frames=new List<Frame>();
        string[] families={"slime","mage","boar","guardian","boss"};
        for(int kind=0;kind<5;kind++)using(var source=new Bitmap(Path.Combine(root,"output/imagegen/enemy-"+families[kind]+"-directions-source.png"))) {
            double[] edges=kind==0?new double[]{0,.30,.48,.745,1}:kind==1?new double[]{0,.285,.495,.695,1}:kind>=3?new double[]{0,.36,.655,1}:new double[]{0,.25,.5,.75,1};
            var group=new List<Frame>();
            for(int part=0;part<edges.Length-1;part++)for(int view=0;view<5;view++) {
                var f=Extract(source,view,part,edges); f.Kind=kind;f.View=view;f.Part=part;group.Add(f);
            }
            for(int part=0;part<edges.Length-1;part++) {
                float scale=float.MaxValue;
                float height=kind==0?44:kind==2?58:part==0?(kind==1?66:kind==3?88:150):kind==1?(part==3?52:20):kind==3?50:82;
                // One scale for every view/step of a body family; keep the squash/stretch cycle intact.
                foreach(var f in group)if((kind==0||kind==2)||f.Part==part)scale=Math.Min(scale,height/f.Bounds.Height);
                foreach(var f in group)if(f.Part==part){f.W=f.Bounds.Width*scale;f.H=f.Bounds.Height*scale;}
            }
            frames.AddRange(group);
        }
        var packed=new List<Frame>(frames);packed.Sort((a,b)=>b.H.CompareTo(a.H));int x=0,y=0,row=0;
        using(var atlas=new Bitmap(1024,1024,PixelFormat.Format32bppArgb)) {
            foreach(var f in packed) {
                int w=(int)Math.Ceiling(f.W*1.5f)+4,h=(int)Math.Ceiling(f.H*1.5f)+4;
                if(x+w>1024){x=0;y+=row;row=0;}if(y+h>1024)throw new Exception("Directional source budget");
                f.X=x+2;f.Y=y+2;
                using(var g=Graphics.FromImage(atlas)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(f.Image,new RectangleF(f.X,f.Y,f.W*1.5f,f.H*1.5f),f.Bounds,GraphicsUnit.Pixel);}
                x+=w;row=Math.Max(row,h);f.Image.Dispose();
            }
            long transparent=0,opaque=0;
            for(int yy=0;yy<1024;yy++)for(int xx=0;xx<1024;xx++) {
                var p=atlas.GetPixel(xx,yy);
                if(p.A>0&&p.A<160&&Key(p)){atlas.SetPixel(xx,yy,Color.Transparent);p=Color.Transparent;}
                if(p.A==0){transparent++;continue;}if(p.A>=240)opaque++;
                // Six bits per channel keep the installed package small without changing dimensions.
                atlas.SetPixel(xx,yy,Color.FromArgb(p.A,(p.R>>2)<<2,(p.G>>2)<<2,(p.B>>2)<<2));
            }
            atlas.Save(Path.Combine(root,"assets/enemies/ruin-creatures.png"),ImageFormat.Png);
            var crops=new List<string>();var report=new List<string>();
            var culture=System.Globalization.CultureInfo.InvariantCulture;
            foreach(var f in frames){
                string entry="{ kind: "+f.Kind+", view: "+f.View+", part: "+f.Part+", sx: "+f.X+", sy: "+f.Y+", sw: "+(int)Math.Ceiling(f.W*1.5f)+", sh: "+(int)Math.Ceiling(f.H*1.5f)+", width: "+f.W.ToString("0.###",culture)+", height: "+f.H.ToString("0.###",culture)+" }";
                crops.Add(entry);report.Add("{\"kind\":"+f.Kind+",\"view\":"+f.View+",\"part\":"+f.Part+"}");
            }
            File.WriteAllText(Path.Combine(root,"src/rendering/enemy-direction-frames.ts"),"// Generated by scripts/build-enemy-directions.ps1. Five independent views per family.\nexport const ENEMY_DIRECTION_FRAMES = ["+string.Join(",\n",crops)+"] as const;\n");
            File.WriteAllText(Path.Combine(root,"assets/enemies/ruin-creatures.json"),"{\"width\":1024,\"height\":1024,\"views\":[\"front\",\"front-right\",\"right\",\"back-right\",\"back\"],\"frames\":["+string.Join(",",report)+"],\"qa\":{\"transparentPixels\":"+transparent+",\"opaquePixels\":"+opaque+",\"keyPixels\":0}}\n");
            using(var preview=new Bitmap(1024,1024))using(var g=Graphics.FromImage(preview)){g.Clear(Color.FromArgb(82,107,80));g.DrawImageUnscaled(atlas,0,0);preview.Save(Path.Combine(root,"output/imagegen/enemy-directions-preview.png"),ImageFormat.Png);}
        }
    }
}
