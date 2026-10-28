import { splitMatches } from './smartSearchModel.js'

/** Text with the matched search terms wrapped in <mark>. */
export default function Marked({ text, terms }) {
    return splitMatches(text, terms).map((part, index) => (
        part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>
    ))
}
