const DS = window.ChiaroFilmesDesignSystem_7fe4c8;
const ESPACOS = [
  { id:'Mirante', area:'140m²', imgs:['estudio-mirante-1.jpg'], d:'Espaço versátil para a montagem de diferentes cenários personalizados de acordo com as necessidades do cliente.', feats:['Cenários personalizados','Grandes produções','Eventos e gravações'] },
  { id:'Água', area:'42m²', imgs:['estudio-agua-1.jpg','estudio-agua-2.jpg'], d:'Ideal para gravação ou transmissão de cursos e treinamentos.', feats:['Cabine de corte','Chroma Key','Púlpito e quadro branco'] },
  { id:'Fogo', area:'42m²', imgs:['estudio-fogo-1.jpg','estudio-fogo-2.jpg'], d:'Ideal para gravação ou transmissão de cursos e treinamentos.', feats:['Cabine de corte','Chroma Key','Púlpito e quadro branco'] },
  { id:'Terra', area:'40m²', imgs:['estudio-terra-1.jpg','estudio-terra-2.jpg'], d:'Ideal para gravação ou transmissão de cursos e treinamentos.', feats:['Cabine de corte','Chroma Key','Púlpito e quadro branco'] },
  { id:'Ar', area:'40m²', imgs:['estudio-ar-1.jpg','estudio-ar-2.jpg'], d:'Cenografia modular, moderna e versátil — de cursos e treinamentos a entrevistas e eventos.', feats:['TV 85" The Frame','Lousa digital','Cenografia modular'] },
  { id:'Camarim', area:'32m²', imgs:['camarim-1.jpg','camarim-2.jpg'], d:'Ambiente acolhedor e confortável para os convidados, com copa equipada, sala de estar e banheiros com chuveiro.', feats:['Copa com Nespresso','Sala de estar','Banheiros dedicados'] },
];

function Espacos() {
  const [cur, setCur] = React.useState('Mirante');
  const [img, setImg] = React.useState(0);
  const e = ESPACOS.find(x => x.id === cur);
  React.useEffect(() => setImg(0), [cur]);
  return <section id="espacos" data-screen-label="Espaços" style={{ background:'var(--chiaro-nevoa)', padding:'128px 0' }}>
    <div style={siteStyles.wrap}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:32, flexWrap:'wrap' }}>
        <DS.SectionTitle eyebrow="Nossos espaços" light="Cinco estúdios," bold="um camarim" size={64} />
        <p style={{ ...siteStyles.body, maxWidth:400, color:'var(--text-secondary)' }}>Estrutura completa para gravar ou transmitir, com equipe técnica e suporte do início ao fim.</p>
      </div>
      <div style={{ margin:'48px 0 32px', overflowX:'auto' }}>
        <DS.Tabs items={ESPACOS.map(x => x.id)} value={cur} onChange={setCur} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.6fr) minmax(0,1fr)', gap:32, alignItems:'stretch' }}>
        <div style={{ position:'relative' }}>
          <DS.MediaCard image={IMG + e.imgs[img]} ratio="16 / 10" style={{ boxShadow:'var(--shadow-md)' }} />
          {e.imgs.length > 1 && <div style={{ position:'absolute', right:16, bottom:16, display:'flex', gap:8 }}>
            <DS.IconButton icon="alt-arrow-left"label="Anterior" variant="glass" size={40} onClick={() => setImg((img + e.imgs.length - 1) % e.imgs.length)} />
            <DS.IconButton icon="alt-arrow-right"label="Próxima" variant="glass" size={40} onClick={() => setImg((img + 1) % e.imgs.length)} />
          </div>}
        </div>
        <div style={{ background:'#fff', borderRadius:'var(--radius-lg)', padding:36, boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column', gap:20 }}>
          <div style={{ display:'flex', gap:8 }}><DS.Badge tone="soft">{e.area}</DS.Badge>{e.id !== 'Camarim' && <DS.Badge tone="warm">Estúdio</DS.Badge>}</div>
          <h3 style={{ margin:0, fontFamily:'var(--font-display)', fontSize:48, lineHeight:.95, textTransform:'uppercase', color:'var(--text-brand)' }}>{e.id === 'Camarim' ? <span style={{ fontWeight:800 }}>Camarim</span> : <><span style={{ fontWeight:300 }}>Estúdio </span><span style={{ fontWeight:800 }}>{e.id}</span></>}</h3>
          <p style={{ ...siteStyles.body, color:'var(--text-secondary)' }}>{e.d}</p>
          <ul style={{ listStyle:'none', margin:0, padding:0, display:'flex', flexDirection:'column', gap:12 }}>
            {e.feats.map(f => <li key={f} style={{ display:'flex', alignItems:'center', gap:12, font:'500 15px var(--font-body)' }}><DS.Icon name="check-circle" size={20}color="var(--chiaro-violeta)" />{f}</li>)}
          </ul>
          <div style={{ marginTop:'auto' }}><DS.Button variant="secondary" iconRight="arrow-right" onClick={() => window.__goContato(e.id)}>Reservar este espaço</DS.Button></div>
        </div>
      </div>
    </div>
  </section>;
}

function Sobre() {
  return <section id="sobre" data-screen-label="Quem somos" style={{ background:'#fff', padding:'0 0 128px', overflow:'hidden' }}>
    <div style={{ ...siteStyles.wrap, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:40 }}>
      <DS.EchoTitle text="Quem somos" repeat={4} size={88} style={{ marginTop:-40 }} />
      <p style={{ ...siteStyles.body, fontSize:20, maxWidth:760 }}>Nós acreditamos que imagens falam mais alto que palavras e, apesar disso, não medimos palavras para encantar o mundo. Somos uma produtora audiovisual dedicada a criar soluções que <b>superam expectativas</b>, combinando excelência técnica e criatividade.</p>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center' }}>
        {['Versátil','Influente','Dedicada','Audaciosa','Sensível'].map(w => <DS.Tag key={w}>{w}</DS.Tag>)}
      </div>
    </div>
  </section>;
}

Object.assign(window, { Espacos, Sobre, ESPACOS });
