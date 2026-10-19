// Where to reach me, in the order shown; the page only ever shows the label, never the address behind it.
const CONTACT = [
  { label: 'mail', href: 'mailto:miasizgoric.mig@gmail.com' },
  { label: 'linkedin', href: 'https://www.linkedin.com/in/miasizgoric' },
  { label: 'github', href: 'https://github.com/miasizgoric' },
]

export function ContactFooter() {
  return (
    <footer className="mx-auto mt-auto flex w-full max-w-[18rem] flex-col items-center gap-4 border-t border-white/10 pt-8 font-mono text-[11px] lowercase tracking-[0.3em] sm:max-w-lg">
      <span className="text-white/30">contact</span>
      <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3">
        {CONTACT.map(({ label, href }) => {
          const external = href.startsWith('http')
          return (
            <li key={label}>
              <a
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-white/55 outline-none transition-colors hover:text-white focus-visible:text-white focus-visible:underline focus-visible:underline-offset-4"
              >
                {label}
              </a>
            </li>
          )
        })}
      </ul>
    </footer>
  )
}
