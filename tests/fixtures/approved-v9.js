// Preserved original v9 draw function; independent of production art.
let mood='idle',since=performance.now(),hat=true;
function draw(canvas,t){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,24,24);const age=t-since,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;const state=(mood==='done'&&age>1400)||(mood==='interrupted'&&age>650)?'idle':mood;let hop=!reduce&&state==='done'?-Math.round(Math.sin(Math.min(age/900,1)*Math.PI)*3):!reduce&&state==='error'&&age<250?-1:!reduce&&state==='working'?-Math.round((1-Math.cos(age/400))/2):0;const dot=(x,y,w,h,col)=>{ctx.fillStyle=col;ctx.fillRect(x,y,w,h)};
// Compact, asymmetric sprite with stepped side bumps and a flat palette.
const rows=[[8,15],[6,17],[5,18],[5,18],[4,19],[5,18],[4,19],[3,19],[3,20],[4,20],[4,19],[5,18]];
rows.forEach(([left,right],i)=>{let y=12+i+hop;for(let x=left;x<=right;x++){let edge=x===left||x===right||i===0||i===11;let color=edge?'#24618e':x<left+3?'#338bc4':i>8?'#419bd1':'#64b9ed';dot(x,y,1,1,color);}});
dot(7,14+hop,3,1,'#89d0f5');dot(5,20+hop,2,2,'#338bc4');dot(17,21+hop,2,1,'#338bc4');
if(hat){const edge='#655887',purple='#b5a1df',light='#d6c8f2',shade='#9180bf',hatY=hop-1;dot(8,8+hatY,8,1,edge);dot(7,9+hatY,10,3,edge);dot(8,9+hatY,8,1,light);dot(8,10+hatY,8,2,purple);dot(15,10+hatY,1,2,shade);dot(6,12+hatY,12,1,edge);dot(7,12+hatY,10,1,shade);dot(5,13+hatY,14,1,edge);dot(6,13+hatY,12,1,purple);dot(4,14+hatY,16,1,edge);dot(5,14+hatY,14,1,purple);dot(4,15+hatY,16,1,edge);dot(10,11+hatY,2,1,'#fff0cb');}
const thinkingPhase=age%4800;
const ey=17+hop,ink='#193f62',ex=state==='thinking'&&(reduce||(thinkingPhase>=1100&&thinkingPhase<3000))?1:0;
const blink=!reduce&&((state==='idle'&&t%4900<140)||(state==='thinking'&&thinkingPhase>=3650&&thinkingPhase<3790));
for(const x of [7+ex,15+ex]){if(state==='done'){dot(x,ey,2,1,ink);dot(x-1,ey+1,1,1,ink);}else if(blink){dot(x,ey+1,2,1,ink);}else{dot(x,ey,2,state==='waiting'?3:2,ink);if(state==='working')dot(x+(x<12?-1:0),ey-1,3,1,ink);}}
if(state==='error'){dot(11,ey+3,2,1,ink);dot(10,ey+4,1,1,ink);}else if(state==='waiting'){dot(11,ey+3,2,2,ink);}else{dot(11,ey+4,2,1,ink);}}
