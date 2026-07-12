import { forwardRef } from 'react'
import {
    Button as AriaButton,
    Dialog,
    DialogTrigger,
    Heading,
    Modal,
    ModalOverlay
} from 'react-aria-components'

export const Button = forwardRef(function Button(props, ref) {
    return <AriaButton {...props} ref={ref} data-kb-primitive="button" />
})

export { Dialog, DialogTrigger, Heading, Modal, ModalOverlay }
