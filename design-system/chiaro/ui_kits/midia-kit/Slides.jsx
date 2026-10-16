const { SectionTitle, EchoTitle, MediaCard, Tabs, Button, Logo, Icon, Badge } = window.ChiaroFilmesDesignSystem_7fe4c8;
const IMG = '../../assets/imagery/';
const mkStyles = {
  light: { position:'absolute', inset:0, background:'var(--chiaro-nevoa)', color:'var(--chiaro-grafite)', padding:'110px 70px 70px', boxSizing:'border-box' },
  dark: { position:'absolute', inset:0, background:'var(--chiaro-noite)', color:'#fff', overflow:'hidden' },
  overline: { position:'absolute', top:56, left:70, font:'800 22px var(--font-display)', textTransform:'uppercase', color:'#fff', letterSpacing:'.02em', zIndex:3 },
  body: { font:'400 24px/1.45 var(--font-body)', maxWidth:1500, margin:'18px 0 34px', textWrap:'pretty' },
};

function Capa() {
  return <div style={mkStyles.dark}>
    <div style={{ position:'absolute', inset:0, background:`url(${IMG}capa-claquete.jpg) center/cover` }} />
  </div>;
}

function QuemSomos() {
  return <div style={{ ...mkStyles.light, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 380px' }}>
    <EchoTitle text="Quem somos" repeat={5} size={118} />
    <p style={{ font:'400 26px/1.5 var(--font-body)', textAlign:'center', marginTop:40, textWrap:'pretty' }}>Nós acreditamos que imagens falam mais alto que palavras e, apesar disso, não medimos palavras para encantar o mundo. Somos uma produtora audiovisual dedicada a criar soluções que não apenas resolvem as necessidades de comunicação de nossos clientes, mas também superam expectativas com projetos que combinam excelência técnica e criatividade. Desde a concepção até a entrega, cada detalhe é cuidadosamente tratado para garantir que cada produção seja tão impressionante quanto as histórias que contamos.</p>
  </div>;
}

function Servico({ image, cols }) {
  return <div style={mkStyles.dark}>
    <div style={{ position:'absolute', inset:0, background:`url(${IMG}${image}) center/cover` }} />
    <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg,rgba(7,0,16,0) 55%,rgba(7,0,16,.85) 100%)' }} />
    <div style={mkStyles.overline}>Nossos serviços</div>
    <div style={{ position:'absolute', left:340, right:340, bottom:70, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:44, font:'400 22px/1.4 var(--font-body)', textAlign:'justify' }}>
      {cols.map((c, i) => <p key={i} style={{ margin:0 }} dangerouslySetInnerHTML={{ __html:c }} />)}
    </div>
  </div>;
}

function Espaco({ light, bold, text, images }) {
  return <div style={mkStyles.light}>
    <SectionTitle light={light} bold={bold} size={112} />
    <p style={mkStyles.body}>{text}</p>
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${images.length},1fr)`, gap:28, height: 620 }}>
      {images.map(src => <MediaCard key={src} image={IMG + src} ratio="auto" style={{ height:'100%', boxShadow:'var(--shadow-md)' }} />)}
    </div>
  </div>;
}

function Producoes({ onPlay }) {
  const cats = ['Institucional', 'Motion', 'Aftermovie', 'In Company'];
  const [cat, setCat] = React.useState('Institucional');
  const thumbs = { Institucional:['producao-externa.jpg','estudio-mirante-1.jpg','camarim-2.jpg'], Motion:['clientes-tvs.png','estudio-ar-2.jpg','capa-claquete.jpg'], Aftermovie:['transmissoes.jpg','estudio-ar-1.jpg','estudio-terra-1.jpg'], 'In Company':['estudio-agua-1.jpg','estudio-fogo-2.jpg','producao-externa.jpg'] }[cat];
  return <div style={{ ...mkStyles.dark, background:'var(--gradient-noite)' }}>
    <div style={mkStyles.overline}>Nossas produções</div>
    <div style={{ position:'absolute', top:150, left:70, right:70, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div data-theme="noite"><Tabs variant="pill" items={cats} value={cat} onChange={setCat} style={{ transform:'scale(1.5)', transformOrigin:'left center' }} /></div>
      <div style={{ font:'600 22px/1.25 var(--font-body)', textAlign:'right' }}>Clique nas imagens<br />para ver os vídeos.</div>
    </div>
    <div style={{ position:'absolute', left:70, top:250, font:'900 230px/.9 var(--font-display)', textTransform:'uppercase', color:'var(--chiaro-lavanda)', opacity:.9, transform:'rotate(-8deg) skewX(-6deg)', transformOrigin:'left', whiteSpace:'nowrap', textShadow:'0 14px 0 #402B6D, 0 28px 60px rgba(0,0,0,.6)' }}>{cat}</div>
    <div style={{ position:'absolute', left:420, right:70, bottom:70, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:28 }}>
      {thumbs.map(t => <MediaCard key={cat + t} image={IMG + t} ratio="16 / 10" playable onClick={() => onPlay(cat)} style={{ boxShadow:'var(--shadow-lg)' }} />)}
    </div>
  </div>;
}

function Clientes() {
  return <div style={mkStyles.dark}>
    <div style={{ position:'absolute', inset:0, background:`url(${IMG}clientes-tvs.png) center/cover` }} />
    <div style={{ position:'absolute', left:110, top:'50%', transform:'translateY(-50%)' }}>
      <SectionTitle light="Nossos" bold="Clientes" size={130} color="#fff" style={{ maxWidth:600 }} />
    </div>
  </div>;
}

function Contato() {
  return <div style={{ ...mkStyles.dark, background:'var(--gradient-noite)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:40 }}>
    <EchoTitle text="Contato" repeat={3} size={150} color="var(--chiaro-lavanda)" />
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14, font:'400 34px var(--font-body)' }}>
      <a href="mailto:contato@chiarofilmes.com" style={{ color:'#fff', display:'flex', gap:14, alignItems:'center' }}><Icon name="letter" weight="bold-duotone" size={32}color="var(--chiaro-pessego)" />contato@chiarofilmes.com</a>
      <a href="tel:+5519996556356" style={{ color:'#fff', display:'flex', gap:14, alignItems:'center' }}><Icon name="phone" weight="bold-duotone" size={32}color="var(--chiaro-pessego)" />+55 19 99655-6356</a>
    </div>
    <Logo variant="filmesHorizontal" inverse height={34} base="../../" style={{ position:'absolute', bottom:70 }} />
  </div>;
}

Object.assign(window, { Capa, QuemSomos, Servico, Espaco, Producoes, Clientes, Contato });
