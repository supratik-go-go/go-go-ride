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
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.ArrayList;

/**
 * Small Android helpers the web code can't do itself (src/native/device.js): is the phone's
 * Location switched on, open the Location switch or GO-GO Ride's own permission page directly,
 * voice search through Android's own voice typing (no microphone permission needed: the Google
 * app records), and Sign in with Google through Android's Credential Manager.
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

    /**
     * Sign in with Google: { clientId } is the server's "Web application" client ID. Shows Google's
     * account picker and resolves { idToken } for the server to check; rejects with code CANCELLED
     * when the person closes it, NO_ACCOUNT when the phone has no Google account.
     */
    @PluginMethod
    public void googleSignIn(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || clientId.isEmpty()) {
            call.reject("Google sign-in is not set up yet.");
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(
            getActivity(),
            request,
            null,
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (!(credential instanceof CustomCredential)
                        || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        call.reject("Google sign-in failed. Please try again.");
                        return;
                    }
                    try {
                        GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                        JSObject out = new JSObject();
                        out.put("idToken", google.getIdToken());
                        call.resolve(out);
                    } catch (Exception e) {
                        call.reject("Google sign-in failed. Please try again.", e);
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    if (e instanceof GetCredentialCancellationException) call.reject("Cancelled", "CANCELLED");
                    else if (e instanceof NoCredentialException) call.reject("Add a Google account to this phone first (Settings > Accounts).", "NO_ACCOUNT");
                    else call.reject("Google sign-in failed. Please try again.", e);
                }
            }
        );
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
