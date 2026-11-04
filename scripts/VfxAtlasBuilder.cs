using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Collections.Generic;

// Offline cleanup for the inspected 4x4 elemental sheet, not arbitrary generated images.
public static class VfxAtlasBuilder {
    static bool Key(Color p) {
        return (p.R > 180 && p.B > 155 && p.G < 105)
            || (p.R > 205 && p.G < 75 && p.B < 100)
            || (p.R > 210 && p.G > 210 && p.B < 75)
            || (p.B > 190 && p.R < 75 && p.G < 100);
    }
    public static void Build(string root) {
        string input=Path.Combine(root,"output/imagegen/element-vfx-source.png"),output=Path.Combine(root,"assets/vfx");
        Directory.CreateDirectory(output);
        var report=new List<string>();
        using(var source=new Bitmap(input)) using(var atlas=new Bitmap(512,512,PixelFormat.Format32bppArgb)) {
            for(int row=0;row<4;row++)for(int col=0;col<4;col++){
                int x0=col*source.Width/4,y0=row*source.Height/4,w=(col+1)*source.Width/4-x0,h=(row+1)*source.Height/4-y0;
                var pixels=new Color[w*h];var seen=new bool[w*h];var pieces=new List<List<int>>();int largest=0;
                for(int y=0;y<h;y++)for(int x=0;x<w;x++){
                    var p=source.GetPixel(x+x0,y+y0);pixels[y*w+x]=p.A<35||Key(p)?Color.Transparent:p;
                }
                for(int i=0;i<pixels.Length;i++){
                    if(seen[i]||pixels[i].A==0)continue;
                    var piece=new List<int>();var queue=new Queue<int>();queue.Enqueue(i);seen[i]=true;
                    while(queue.Count>0){
                        int n=queue.Dequeue(),nx=n%w,ny=n/w;piece.Add(n);
                        for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){
                            int xx=nx+dx,yy=ny+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;int next=yy*w+xx;
                            if(!seen[next]&&pixels[next].A>0){seen[next]=true;queue.Enqueue(next);}
                        }
                    }
                    largest=Math.Max(largest,piece.Count);pieces.Add(piece);
                }
                int left=w,top=h,right=0,bottom=0,kept=0;
                using(var frame=new Bitmap(w,h,PixelFormat.Format32bppArgb)){
                    foreach(var piece in pieces)if(piece.Count>=Math.Max(24,largest/200))foreach(int n in piece){
                        int x=n%w,y=n/w;frame.SetPixel(x,y,pixels[n]);kept++;
                        left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x+1);bottom=Math.Max(bottom,y+1);
                    }
                    if(kept<500||left<3||top<3||right>w-3||bottom>h-3)throw new Exception("Invalid VFX cell: "+row+":"+col);
                    float maxW=112,maxH=row==2?56:112,scale=Math.Min(maxW/(right-left),maxH/(bottom-top));
                    float dw=(right-left)*scale,dh=(bottom-top)*scale;
                    using(var g=Graphics.FromImage(atlas)){
                        g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;
                        g.DrawImage(frame,new RectangleF(col*128+(128-dw)/2,row*128+(128-dh)/2,dw,dh),Rectangle.FromLTRB(left,top,right,bottom),GraphicsUnit.Pixel);
                    }
                    report.Add("{\"row\":"+row+",\"column\":"+col+",\"x\":"+(col*128)+",\"y\":"+(row*128)+",\"pixels\":"+kept+"}");
                }
            }
            long transparent=0,opaque=0,bad=0;
            for(int y=0;y<512;y++)for(int x=0;x<512;x++){
                var p=atlas.GetPixel(x,y);
                if(p.A>0&&Key(p)){atlas.SetPixel(x,y,Color.Transparent);p=Color.Transparent;}
                if(p.A==0)transparent++;if(p.A>=240)opaque++;if(p.A>35&&Key(p))bad++;
            }
            if(transparent<130000||opaque<20000||bad!=0)throw new Exception("VFX alpha/key validation failed "+transparent+":"+opaque+":"+bad);
            atlas.Save(Path.Combine(output,"elements.png"),ImageFormat.Png);
            File.WriteAllText(Path.Combine(output,"elements.json"),"{\"width\":512,\"height\":512,\"cell\":128,\"columns\":[\"fire\",\"ice\",\"lightning\",\"force\"],\"rows\":[\"projectile\",\"impact\",\"field\",\"focus\"],\"frames\":["+string.Join(",",report)+"],\"qa\":{\"transparentPixels\":"+transparent+",\"opaquePixels\":"+opaque+",\"keyPixels\":"+bad+"}}\n");
            using(var preview=new Bitmap(512,512))using(var g=Graphics.FromImage(preview)){
                g.Clear(Color.FromArgb(82,107,80));g.DrawImageUnscaled(atlas,0,0);preview.Save(Path.Combine(root,"output/imagegen/element-vfx-preview.png"),ImageFormat.Png);
            }
        }
    }
}
