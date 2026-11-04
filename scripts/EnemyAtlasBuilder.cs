using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Collections.Generic;

// Offline chroma cleanup and deterministic, foot-aligned normalization.
public static class EnemyAtlasBuilder {
    class Frame { public Bitmap Image; public Rectangle Bounds; public int Pixels; }
    static bool Key(Color p) { return (p.R > 150 && p.B > 120 && p.G < Math.Min(p.R,p.B)*.64)
        || (p.R > 195 && p.G < 85 && p.B < 105)
        || (p.R > 200 && p.G > 200 && p.B < 85)
        || (p.B > 195 && p.R < 75 && p.G < 100); }
    static Frame Extract(Bitmap source,int col,int row) {
        // The generated 1120x1400 sheet has uneven lower row gutters; inspected source boundaries.
        double[] edges={0,.2,.4,.58,.775,1};
        int x0=col*source.Width/4,y0=(int)(edges[row]*source.Height),w=(col+1)*source.Width/4-x0,h=(int)(edges[row+1]*source.Height)-y0;
        var pixels=new Color[w*h];var seen=new bool[w*h];var pieces=new List<List<int>>();int largest=0;
        var outside=new bool[w*h];var flood=new Queue<int>();
        for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
            int n=y*w+x;pixels[n]=source.GetPixel(x+x0,y+y0);
            if((x==0||y==0||x==w-1||y==h-1)&&(pixels[n].A<32||Key(pixels[n]))) {outside[n]=true;flood.Enqueue(n);}
        }
        // Only remove background-connected key colors: enclosed gold core highlights are real art.
        while(flood.Count>0) {
            int n=flood.Dequeue(),nx=n%w,ny=n/w;
            for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++) {
                int xx=nx+dx,yy=ny+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;int next=yy*w+xx;
                if(!outside[next]&&(pixels[next].A<32||Key(pixels[next]))) {outside[next]=true;flood.Enqueue(next);}
            }
        }
        for(int n=0;n<pixels.Length;n++)if(pixels[n].A<32||(outside[n]&&Key(pixels[n])))pixels[n]=Color.Transparent;
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
        foreach(var piece in pieces)if(piece.Count>=Math.Max(24,largest/150))foreach(int n in piece) {
            int x=n%w,y=n/w;image.SetPixel(x,y,pixels[n]);kept++;left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x+1);bottom=Math.Max(bottom,y+1);
        }
        if(kept<500||left<2||top<2||right>w-2||bottom>h-2)throw new Exception("Invalid enemy cell "+row+":"+col+" bounds "+left+","+top+","+right+","+bottom+" cell "+w+","+h);
        return new Frame { Image=image, Bounds=Rectangle.FromLTRB(left,top,right,bottom), Pixels=kept };
    }
    public static void Build(string root) {
        string output=Path.Combine(root,"assets/enemies");Directory.CreateDirectory(output);
        var frames=new Frame[5,4];var report=new List<string>();var crops=new List<string>();
        using(var source=new Bitmap(Path.Combine(root,"output/imagegen/enemy-family-source.png")))
        using(var atlas=new Bitmap(1024,1024,PixelFormat.Format32bppArgb)) {
            for(int row=0;row<5;row++)for(int col=0;col<4;col++)frames[row,col]=Extract(source,col,row);
            for(int row=0;row<5;row++) {
                float familyScale=float.MaxValue;
                if(row==0||row==2)for(int col=0;col<4;col++)familyScale=Math.Min(familyScale,Math.Min(176f/frames[row,col].Bounds.Width,(row==0?136f:160f)/frames[row,col].Bounds.Height));
                for(int col=0;col<4;col++) {
                    var f=frames[row,col];float scale=row==0||row==2?familyScale:Math.Min(176f/f.Bounds.Width,176f/f.Bounds.Height);
                    float dw=f.Bounds.Width*scale,dh=f.Bounds.Height*scale,x=col*192+(192-dw)/2,y=row*192+184-dh;
                    using(var g=Graphics.FromImage(atlas)) { g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.DrawImage(f.Image,new RectangleF(x,y,dw,dh),f.Bounds,GraphicsUnit.Pixel); }
                    report.Add("{\"kind\":"+row+",\"frame\":"+col+",\"pixels\":"+f.Pixels+"}");f.Image.Dispose();
                    int cx=(int)Math.Floor(x)-1,cy=(int)Math.Floor(y)-1,cw=(int)Math.Ceiling(dw)+2,ch=(int)Math.Ceiling(dh)+2;
                    crops.Add("{ sx: "+cx+", sy: "+cy+", sw: "+cw+", sh: "+ch+" }");
                }
            }
            long transparent=0,opaque=0,bad=0;
            for(int y=0;y<1024;y++)for(int x=0;x<1024;x++) { var p=atlas.GetPixel(x,y);if(p.A>0&&p.A<160&&Key(p)){atlas.SetPixel(x,y,Color.Transparent);p=Color.Transparent;}if(p.A==0)transparent++;if(p.A>=240)opaque++;if(p.A>32&&p.A<160&&Key(p))bad++; }
            if(transparent<500000||opaque<40000||bad!=0)throw new Exception("Enemy alpha/key validation failed");
            atlas.Save(Path.Combine(output,"ruin-creatures.png"),ImageFormat.Png);
            File.WriteAllText(Path.Combine(root,"src/rendering/enemy-art-frames.ts"),"// Generated by scripts/build-enemy-art.ps1; crops exclude transparent cell padding.\nexport const ENEMY_ART_FRAMES = ["+string.Join(", ",crops)+"] as const;\n");
            File.WriteAllText(Path.Combine(output,"ruin-creatures.json"),"{\"width\":1024,\"height\":1024,\"cell\":192,\"columns\":4,\"rows\":5,\"foot\":[96,184],\"families\":[\"moss-slime\",\"ruin-mage\",\"wild-boar\",\"moss-guardian\",\"crowned-core\"],\"frames\":["+string.Join(",",report)+"],\"qa\":{\"transparentPixels\":"+transparent+",\"opaquePixels\":"+opaque+",\"keyPixels\":"+bad+"}}\n");
            using(var preview=new Bitmap(1024,1024))using(var g=Graphics.FromImage(preview)) { g.Clear(Color.FromArgb(82,107,80));g.DrawImageUnscaled(atlas,0,0);preview.Save(Path.Combine(root,"output/imagegen/enemy-family-preview.png"),ImageFormat.Png); }
        }
    }
}
