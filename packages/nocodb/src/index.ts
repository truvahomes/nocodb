// Must stay first — loads .env before any import reads process.env.
import '~/load-env';
import Noco from './Noco';

export default Noco;

export { Noco };
