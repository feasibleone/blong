import { library } from '@feasibleone/blong';

export default library(proxy => function age(birthDate: Date) {
    const otherDate = new Date();
    let years = (otherDate.getFullYear() - birthDate.getFullYear());

    if (otherDate.getMonth() < birthDate.getMonth() ||
            (otherDate.getMonth() === birthDate.getMonth() && otherDate.getDate() < birthDate.getDate())) {
        years--;
    }

    return years;
});
