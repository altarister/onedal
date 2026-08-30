import { IAppPlugin } from './IAppPlugin';
import { InsungPlugin } from './insung/InsungPlugin';
import { Hwamul24Plugin } from './hwamul24/Hwamul24Plugin';
import { KakaoPickerPlugin } from './kakaopicker/KakaoPickerPlugin';

export class PluginFactory {
    static getPlugin(targetApp: string = 'insung'): IAppPlugin {
        switch (targetApp.toLowerCase()) {
            case 'hwamul24':
                return new Hwamul24Plugin();
            case 'kakaopicker':
                return new KakaoPickerPlugin();
            case 'insung':
            default:
                return new InsungPlugin();
        }
    }
}
