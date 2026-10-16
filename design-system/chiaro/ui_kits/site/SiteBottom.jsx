const DSC = window.ChiaroFilmesDesignSystem_7fe4c8;
const SERV_OPTS = ['Produção externa','Transmissão ao vivo','Gravação em estúdio','Cobertura de evento'];

function Contato({ espaco }) {
  const [form, setForm] = React.useState({ nome:'', email:'', tel:'', espaco:'', msg:'' });
  const [servs, setServs] = React.useState([]);
  const [err, setErr] = React.useState({});
  const [sent, setSent] = React.useState(false);
  React.useEffect(() => { if (espaco) setForm(f => ({ ...f, espaco })); }, [espaco]);
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  const toggle = s => setServs(v => v.includes(s) ? v.filter(x => x !== s) : [...v, s]);
  const submit = e => {
    e.preventDefault();
    const er = {};
    if (!form.nome.trim()) er.nome = 'Conte pra gente seu nome';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Informe um e-mail válido';
    if (!form.msg.trim()) er.msg = 'Escreva uma mensagem';
    setErr(er);
    if (!Object.keys(er).length) { setSent(true); setTimeout(() => setSent(false), 5000); setForm({ nome:'', email:'', tel:'', espaco:'', msg:'' }); setServs([]); }
  };
  return <section id="contato" data-screen-label="Contato" style={{ background:'var(--gradient-noite)', color:'#fff', padding:'128px 0 0' }}>
    <div style={{ ...siteStyles.wrap, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap:64, alignItems:'start' }}>
      <div>
        <div style={siteStyles.overline}>Vamos criar juntos</div>
        <DSC.SectionTitle light="Conte sua" bold="história" size={72} color="#fff" style={{ marginTop:14 }} />
        <p style={{ ...siteStyles.body, color:'#B9B1CC', margin:'24px 0 40px', maxWidth:420 }}>Fale com a gente sobre seu projeto. Respondemos em até 24 horas para alinhar cada detalhe.</p>
        <div style={{ display:'flex', flexDirection:'column', gap:18, font:'400 18px var(--font-body)' }}>
          {[['letter','contato@chiarofilmes.com','mailto:contato@chiarofilmes.com'],['phone','+55 19 99655-6356','tel:+5519996556356'],['camera-square','@chiarofilmes','https://instagram.com/chiarofilmes']].map(([i,l,h]) =>
            <a key={i} href={h} style={{ color:'#fff', display:'flex', alignItems:'center', gap:14, textDecoration:'none' }}><span style={{ width:44, height:44, borderRadius:999, background:'rgba(140,78,219,.22)', display:'inline-flex', alignItems:'center', justifyContent:'center' }}><DSC.Icon name={i} weight="bold-duotone" size={20} color="var(--chiaro-pessego)" /></span>{l}</a>)}
        </div>
      </div>
      <form onSubmit={submit} noValidate style={{ background:'#fff', color:'var(--text-primary)', borderRadius:'var(--radius-xl)', padding:40, boxShadow:'var(--shadow-lg)', display:'flex', flexDirection:'column', gap:20 }}>
        <DSC.Input label="Nome" placeholder="Seu nome" value={form.nome} onChange={set('nome')} error={err.nome} />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:16 }}>
          <DSC.Input label="E-mail" type="email" placeholder="voce@empresa.com" value={form.email} onChange={set('email')} error={err.email} />
          <DSC.Input label="Telefone" placeholder="+55 19" value={form.tel} onChange={set('tel')} />
        </div>
        <div>
          <span style={{ display:'block', font:'700 12px var(--font-display)', letterSpacing:'.04em', textTransform:'uppercase', marginBottom:12 }}>Serviços de interesse</span>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>{SERV_OPTS.map(s => <DSC.Checkbox key={s} checked={servs.includes(s)} onChange={() => toggle(s)} label={s} />)}</div>
        </div>
        <DSC.Select label="Espaço" placeholder="Nenhum / ainda não sei" options={ESPACOS.map(e => e.id === 'Camarim' ? e.id : 'Estúdio ' + e.id)} value={form.espaco} onChange={set('espaco')} />
        <DSC.Input label="Mensagem" multiline rows={4} placeholder="Conte um pouco sobre seu projeto, datas e formato" value={form.msg} onChange={set('msg')} error={err.msg} />
        <DSC.Button type="submit" size="lg" fullWidth iconRight="arrow-right">Enviar mensagem</DSC.Button>
      </form>
    </div>
    <footer style={{ ...siteStyles.wrap, marginTop:120, padding:'40px var(--page-margin)', borderTop:'1px solid rgba(255,255,255,.1)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:24, flexWrap:'wrap', color:'#857C9C', font:'400 13px var(--font-body)' }}>
      <Logo variant="filmesHorizontal" inverse height={18} base={BASE} />
      <span>© 2026 Chiaro Filmes · chiarofilmes.com</span>
    </footer>
    {sent && <div style={{ position:'fixed', right:24, bottom:24, zIndex:60 }}><DSC.Toast tone="success" title="Mensagem enviada" message="Respondemos em até 24h." onClose={() => setSent(false)} /></div>}
  </section>;
}

Object.assign(window, { Contato });
