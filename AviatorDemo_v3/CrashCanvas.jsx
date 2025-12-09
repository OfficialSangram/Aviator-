import React, { useRef, useEffect } from 'react';

export default function CrashCanvas({ multiplier }){
  const ref = useRef();
  useEffect(()=>{
    const c = ref.current;
    const ctx = c.getContext('2d');
    let w = c.width = c.clientWidth;
    let h = c.height = c.clientHeight;
    let ticks = [];
    // generate a smooth curve that increases and stops at multiplier
    function draw(){
      ctx.clearRect(0,0,w,h);
      // background grid
      ctx.fillStyle = '#031018';
      ctx.fillRect(0,0,w,h);
      // draw curve as exponential
      ctx.beginPath();
      ctx.moveTo(0,h-10);
      for(let i=0;i<w;i+=4){
        const t = i / w;
        const val = Math.min(Math.exp(t*4) / 10, multiplier); // scale
        const y = h - 20 - (val / Math.max(10, multiplier)) * (h-60);
        ctx.lineTo(i, y);
      }
      ctx.strokeStyle = '#ff5a5a';
      ctx.lineWidth = 3;
      ctx.stroke();
      // plane
      const planeX = Math.min(w-60, (multiplier/ (Math.max(2,multiplier))) * (w-120));
      const planeY = h - 40 - (Math.min(multiplier,10)/10) * (h-120);
      // plane body
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(planeX, planeY);
      ctx.lineTo(planeX+28, planeY+6);
      ctx.lineTo(planeX+6, planeY+14);
      ctx.closePath();
      ctx.fill();
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(planeX-6, planeY+16, 40, 6);
      requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener('resize', ()=>{ w = c.width = c.clientWidth; h = c.height = c.clientHeight; });
    return ()=>{};
  }, [multiplier]);
  return (<canvas ref={ref} style={{width:'100%', height:220, borderRadius:8}}/>);
}