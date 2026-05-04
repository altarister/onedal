import { IAppPlugin } from './IAppPlugin';
import { InsungPlugin } from './insung/InsungPlugin';
import { Hwamul24Plugin } from './hwamul24/Hwamul24Plugin';

export class PluginFactory {
    static getPlugin(targetApp: string = 'insung'): IAppPlugin {
        switch (targetApp.toLowerCase()) {
            case 'hwamul24':
                return new Hwamul24Plugin();
            case 'insung':
            default:
                return new InsungPlugin();
        }
    }
}
