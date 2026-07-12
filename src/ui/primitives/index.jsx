import { forwardRef } from 'react'
import {
    Checkbox as AriaCheckbox,
    Input as AriaInput,
    Label,
    SearchField as AriaSearchField,
    Tab as AriaTab,
    TabList,
    TabPanel,
    Tabs as AriaTabs
} from 'react-aria-components'

export { Button, Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from './dialog.jsx'

export const Checkbox = forwardRef(function Checkbox(props, ref) {
    return <AriaCheckbox {...props} ref={ref} data-kb-primitive="checkbox" />
})

export const Input = forwardRef(function Input(props, ref) {
    return <AriaInput {...props} ref={ref} data-kb-primitive="input" />
})

export const SearchField = forwardRef(function SearchField(props, ref) {
    return <AriaSearchField {...props} ref={ref} data-kb-primitive="search-field" />
})

export const Tab = forwardRef(function Tab(props, ref) {
    return <AriaTab {...props} ref={ref} data-kb-primitive="tab" />
})

export const Tabs = forwardRef(function Tabs(props, ref) {
    return <AriaTabs {...props} ref={ref} data-kb-primitive="tabs" />
})

export { Label, TabList, TabPanel }
