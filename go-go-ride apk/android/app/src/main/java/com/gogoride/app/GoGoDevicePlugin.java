package com.gogoride.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.net.Uri;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

/**
 * Small Android helpers the web code can't do itself (src/native/device.js): is the phone's
 * Location switched on, open the Location switch or GO-GO Ride's own permission page directly,
 * and voice search through Android's own voice typing (no microphone permission needed: the
 * Google app records).
 */
@CapacitorPlugin(name = "GoGoDevice")
public class GoGoDevicePlugin extends Plugin {

    @PluginMethod
    public void locationEnabled(PluginCall call) {
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        boolean on = manager != null
            && (manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
        JSObject result = new JSObject();
        result.put("enabled", on);
        call.resolve(result);
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null)));
    }

    /** Listens once in { language: 'en-IN' | 'hi-IN' | 'bn-IN', prompt } and resolves { matches: [...] }. */
    @PluginMethod
    public void listen(PluginCall call) {
        String language = call.getString("language", "en-IN");
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Say where you are going"));
        try {
            startActivityForResult(call, intent, "listenResult");
        } catch (ActivityNotFoundException e) {
            call.reject("Voice typing isn't available on this phone. Install or update the Google app.");
        }
    }

    @ActivityCallback
    private void listenResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSArray matches = new JSArray();
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> heard = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (heard != null) for (String text : heard) matches.put(text);
        }
        JSObject out = new JSObject();
        out.put("matches", matches);
        call.resolve(out);
    }

    private void open(PluginCall call, Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the phone's settings", e);
        }
    }
}
