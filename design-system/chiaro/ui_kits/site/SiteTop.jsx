const { Button, IconButton, Badge, Tabs, MediaCard, SectionTitle, EchoTitle, Logo, Icon, Input, Select, Checkbox, Toast } = window.ChiaroFilmesDesignSystem_7fe4c8;
const IMG = '../../assets/imagery/';
const BASE = '../../';
const siteStyles = {
  wrap: { maxWidth:1280, margin:'0 auto', padding:'0 var(--page-margin)' },
  overline: { font:'800 16px var(--font-display)', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--chiaro-pessego)' },
  body: { font:'400 17px/1.65 var(--font-body)', textWrap:'pretty', margin:0 },
};

function Header({ onNav }) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => { const f = () => setScrolled(window.scrollY > 40); window.addEventListener('scroll', f); return () => window.removeEventListener('scroll', f); }, []);
  const links = [['servicos','Serviços'],['espacos','Espaços'],['sobre','Quem somos'],['contato','Contato']];
  return <header style={{ position:'fixed', top:0, left:0, right:0, zIndex:40, background: scrolled ? 'rgba(7,0,16,.82)' : 'transparent', backdropFilter: scrolled ? 'blur(16px)' : 'none', borderBottom:'1px solid '+(scrolled?'rgba(255,255,255,.08)':'transparent'), transition:'all var(--dur-base) var(--ease-cine)' }}>
    <div style={{ ...siteStyles.wrap, height:76, display:'flex', alignItems:'center', justifyContent:'space-between', gap:24 }}>
      <a href="#topo" onClick={e => { e.preventDefault(); onNav('topo'); }}><Logo variant="filmesHorizontal" inverse height={20} base={BASE} /></a>
      <nav style={{ display:'flex', alignItems:'center', gap:28, flexWrap:'wrap' }}>
        {links.slice(0,3).map(([id,l]) => <a key={id} href={'#'+id} onClick={e => { e.preventDefault(); onNav(id); }} style={{ color:'#fff', font:'500 13px var(--font-display)', letterSpacing:'.06em', textTransform:'uppercase', textDecoration:'none' }}>{l}</a>)}
        <Button size="sm" onClick={() => onNav('contato')}>Fale com a gente</Button>
      </nav>
    </div>
  </header>;
}

function Hero({ onNav }) {
  return <section id="topo" data-screen-label="Hero" style={{ position:'relative', minHeight:'100vh', display:'flex', alignItems:'flex-end', color:'#fff', background:'var(--chiaro-noite)', overflow:'hidden' }}>
    <div style={{ position:'absolute', inset:0, background:`url(${IMG}estudio-ar-1.jpg) center/cover`, opacity:.75 }}></div>
    <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg,rgba(7,0,16,.55) 0%,rgba(7,0,16,.15) 40%,rgba(7,0,16,.92) 100%)' }}></div>
    <div style={{ ...siteStyles.wrap, position:'relative', width:'100%', boxSizing:'border-box', paddingBottom:96, paddingTop:160 }}>
      <div style={siteStyles.overline}>Produtora audiovisual</div>
      <h1 style={{ margin:'18px 0 0', fontFamily:'var(--font-display)', fontSize:'var(--text-display-xl)', lineHeight:.92, textTransform:'uppercase', maxWidth:1000 }}>
        <span style={{ fontWeight:300 }}>Sou escuro</span><br /><span style={{ fontWeight:300 }}>e sou </span><span style={{ fontWeight:800, color:'var(--chiaro-lavanda)' }}>Chiaro.</span>
      </h1>
      <div style={{ display:'flex', gap:40, alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', marginTop:36 }}>
        <p style={{ ...siteStyles.body, fontSize:19, maxWidth:520, color:'#E4DEF0' }}>Da concepção à finalização, criamos produções que unem excelência técnica e criatividade — para que cada história seja tão impressionante quanto merece.</p>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <Button size="lg" variant="gradient" iconRight="arrow-down" onClick={() => onNav('servicos')}>Nossos serviços</Button>
          <Button size="lg" variant="light" onClick={() => onNav('espacos')}>Conheça os estúdios</Button>
        </div>
      </div>
    </div>
  </section>;
}

const SERVICOS = [
  { icon:'clapperboard', t:['Produção','externa'], img:'producao-externa.jpg', d:'Nossa equipe se desloca até a locação escolhida para captar conteúdo para vídeos institucionais, publicitários, documentários e mais.' },
  { icon:'stream', t:['Transmissões','ao vivo'], img:'transmissoes.jpg', d:'Soluções completas para transmissões em tempo real, com alta qualidade de imagem e som para que seu conteúdo alcance o público.' },
  { icon:'videocamera-record', t:['Gravação em','estúdio'], img:'estudio-agua-1.jpg', d:'Cursos on-demand, entrevistas, webinars e videocasts gravados em estúdios equipados com tecnologia de ponta.' },
  { icon:'confetti', t:['Cobertura de','eventos'], img:'estudio-mirante-1.jpg', d:'Registramos cada momento com qualidade e precisão — do aftermovie à cobertura completa, gravada ou ao vivo.' },
];

function Servicos() {
  const [hover, setHover] = React.useState(null);
  return <section id="servicos" data-screen-label="Serviços" style={{ background:'var(--gradient-noite)', color:'#fff', padding:'128px 0' }}>
    <div style={siteStyles.wrap}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:32, flexWrap:'wrap', marginBottom:56 }}>
        <div><div style={siteStyles.overline}>O que fazemos</div><SectionTitle light="Nossos" bold="serviços" size={72} color="#fff" style={{ marginTop:14 }} /></div>
        <p style={{ ...siteStyles.body, maxWidth:420, color:'#B9B1CC' }}>Oferecemos soluções sob medida, com uma equipe dedicada a cada etapa: roteiro, captação, edição e finalização.</p>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:20 }}>
        {SERVICOS.map((s, i) => <article key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ position:'relative', borderRadius:'var(--radius-lg)', overflow:'hidden', minHeight:420, background:'#140A26', border:'1px solid rgba(255,255,255,.08)', display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:28, boxSizing:'border-box', transform: hover===i ? 'translateY(-4px)' : 'none', boxShadow: hover===i ? 'var(--shadow-glow)' : 'none', transition:'all var(--dur-slow) var(--ease-cine)' }}>
          <div style={{ position:'absolute', inset:0, background:`url(${IMG}${s.img}) center/cover`, opacity: hover===i ? .55 : .28, transform: hover===i ? 'scale(1.05)' : 'scale(1)', transition:'all var(--dur-scene) var(--ease-out)' }}></div>
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg,rgba(20,10,38,.2) 0%,rgba(20,10,38,.95) 75%)' }}></div>
          <div style={{ position:'relative' }}>
            <span style={{ width:52, height:52, borderRadius:999, background: hover===i ? 'var(--chiaro-lavanda)' : 'rgba(140,78,219,.22)', display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'background var(--dur-base) var(--ease-cine)' }}><Icon name={s.icon} weight="bold-duotone" size={24} /></span>
            <h3 style={{ margin:'22px 0 12px', fontFamily:'var(--font-display)', fontSize:28, lineHeight:1, textTransform:'uppercase' }}><span style={{ fontWeight:300 }}>{s.t[0]} </span><span style={{ fontWeight:800 }}>{s.t[1]}</span></h3>
            <p style={{ ...siteStyles.body, fontSize:15, color:'#CFC8DE' }}>{s.d}</p>
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}

Object.assign(window, { Header, Hero, Servicos, siteStyles, IMG, BASE });
