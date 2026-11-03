const fs=require('fs'),path=require('path');
const [,, file, out]=process.argv;
const fd=fs.openSync(file,'r');
const hdr=Buffer.alloc(16);fs.readSync(fd,hdr,0,16,0);
const headerSize=hdr.readUInt32LE(4); // pickle size
const jsonLen=hdr.readUInt32LE(12);
const jb=Buffer.alloc(jsonLen);fs.readSync(fd,jb,0,jsonLen,16);
const header=JSON.parse(jb.toString());
const base=8+headerSize;
function walk(node,p){
  for(const [name,n] of Object.entries(node.files||{})){
    const fp=path.join(p,name);
    if(n.files){fs.mkdirSync(fp,{recursive:true});walk(n,fp);}
    else if(n.link){continue;}
    else if(n.unpacked){continue;}
    else{
      const buf=Buffer.alloc(n.size);
      fs.readSync(fd,buf,0,n.size,base+parseInt(n.offset));
      fs.mkdirSync(path.dirname(fp),{recursive:true});
      fs.writeFileSync(fp,buf);
    }
  }
}
fs.mkdirSync(out,{recursive:true});
walk(header,out);
console.log('ok');
